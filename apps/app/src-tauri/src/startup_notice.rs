//! The "Clutter couldn't start" prompt shown by startup recovery (see
//! `offer_recovery` in lib.rs).
//!
//! On macOS this is a system alert (`CFUserNotification`), drawn by the
//! `UserNotificationCenter` process rather than by the app — which is why it
//! works when no webview ever rendered, and also why the plugin-dialog version
//! of it (rfd) could not be taken back: the alert outlived a successful late
//! start and outlived the app itself, leaving buttons that did nothing. Owning
//! the notification handle here lets startup success and app exit cancel it.
//! (A process killed outright still cannot clean up after itself.)

/// What the user chose.
pub enum Choice {
    Retry,
    /// Quit — also what a dismissed or system-cancelled prompt means.
    Quit,
    /// The prompt was cancelled by us (startup succeeded, or the app is exiting).
    Cancelled,
}

#[cfg(target_os = "macos")]
mod imp {
    use super::Choice;
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    };

    use objc2_core_foundation::{
        kCFUserNotificationAlertHeaderKey, kCFUserNotificationAlertMessageKey,
        kCFUserNotificationAlternateButtonTitleKey, kCFUserNotificationAlternateResponse,
        kCFUserNotificationDefaultButtonTitleKey, kCFUserNotificationDefaultResponse,
        kCFUserNotificationStopAlertLevel, CFDictionary, CFRetained, CFString, CFUserNotification,
    };

    struct Notice {
        notification: CFRetained<CFUserNotification>,
        cancelled: AtomicBool,
    }

    // CFUserNotification is a CoreFoundation object; `cancel` and
    // `receive_response` are the documented cross-thread pair (one thread waits
    // for the response, another cancels).
    unsafe impl Send for Notice {}
    unsafe impl Sync for Notice {}

    /// The prompt currently on screen, if any.
    static ACTIVE: Mutex<Option<Arc<Notice>>> = Mutex::new(None);

    /// Dismisses the prompt if one is showing. Safe to call at any time.
    pub fn cancel_active() {
        let active = ACTIVE.lock().ok().and_then(|mut slot| slot.take());
        if let Some(notice) = active {
            notice.cancelled.store(true, Ordering::SeqCst);
            notice.notification.cancel();
        }
    }

    /// Shows the prompt and blocks for the answer. `should_abort` is checked
    /// once the prompt is registered as cancellable, closing the window in
    /// which startup could succeed after the caller's last check but before
    /// `cancel_active` could see this prompt.
    pub fn ask(
        _app: &tauri::AppHandle,
        header: &str,
        message: &str,
        retry_label: &str,
        quit_label: &str,
        should_abort: impl Fn() -> bool,
    ) -> Choice {
        let (header, message, retry, quit) = (
            CFString::from_str(header),
            CFString::from_str(message),
            CFString::from_str(retry_label),
            CFString::from_str(quit_label),
        );
        let (Some(k_header), Some(k_message), Some(k_default), Some(k_alternate)) = (
            unsafe { kCFUserNotificationAlertHeaderKey },
            unsafe { kCFUserNotificationAlertMessageKey },
            unsafe { kCFUserNotificationDefaultButtonTitleKey },
            unsafe { kCFUserNotificationAlternateButtonTitleKey },
        ) else {
            return Choice::Quit;
        };
        let dictionary = CFDictionary::<CFString, CFString>::from_slices(
            &[k_header, k_message, k_default, k_alternate],
            &[&header, &message, &retry, &quit],
        );

        let mut error: i32 = 0;
        let created = unsafe {
            CFUserNotification::new(
                None,
                0.0,
                kCFUserNotificationStopAlertLevel,
                &mut error,
                Some(dictionary.as_opaque()),
            )
        };
        let Some(notification) = created else {
            log::error!("startup recovery: could not create the alert (error {error})");
            return Choice::Quit;
        };

        let notice = Arc::new(Notice {
            notification,
            cancelled: AtomicBool::new(false),
        });
        if let Ok(mut slot) = ACTIVE.lock() {
            *slot = Some(notice.clone());
        }
        if should_abort() {
            cancel_active();
        }

        let mut flags: usize = 0;
        // Timeout 0: wait until answered or cancelled.
        unsafe { notice.notification.receive_response(0.0, &mut flags) };

        if let Ok(mut slot) = ACTIVE.lock() {
            if slot
                .as_ref()
                .is_some_and(|active| Arc::ptr_eq(active, &notice))
            {
                *slot = None;
            }
        }
        if notice.cancelled.load(Ordering::SeqCst) {
            return Choice::Cancelled;
        }
        // The low two bits are the response; 0 is the default button.
        match flags & 0x3 {
            r if r == kCFUserNotificationDefaultResponse as usize => Choice::Retry,
            r if r == kCFUserNotificationAlternateResponse as usize => Choice::Quit,
            _ => Choice::Quit,
        }
    }
}

#[cfg(target_os = "macos")]
pub use imp::{ask, cancel_active};

/// Other platforms: no handle to cancel, so fall back to the dialog plugin.
#[cfg(not(target_os = "macos"))]
pub fn cancel_active() {}

#[cfg(not(target_os = "macos"))]
pub fn ask(
    app: &tauri::AppHandle,
    header: &str,
    message: &str,
    retry_label: &str,
    quit_label: &str,
    _should_abort: impl Fn() -> bool,
) -> Choice {
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
    let retry = app
        .dialog()
        .message(message)
        .title(header)
        .kind(MessageDialogKind::Error)
        .buttons(MessageDialogButtons::OkCancelCustom(
            retry_label.into(),
            quit_label.into(),
        ))
        .blocking_show();
    if retry {
        Choice::Retry
    } else {
        Choice::Quit
    }
}
