// Direct-download updater integration. All Sparkle objects and callbacks live on the main thread.
// The UI can request a restart, but only the frontend's safe-close path can commit it.
#import <Cocoa/Cocoa.h>
#import <Sparkle/Sparkle.h>
#include <stdlib.h>
#include <string.h>

@interface ClutterSparkleDriver : NSObject <SPUUserDriver, SPUUpdaterDelegate>
@property(nonatomic, strong) SPUUpdater *updater;
@property(nonatomic, copy) NSString *phase;
@property(nonatomic, copy) NSString *version;
@property(nonatomic, copy) NSString *errorMessage;
@property(nonatomic, copy) void (^prepare)(void);
@property(nonatomic, copy) void (^install)(void);
@property(nonatomic) BOOL explicitInstall;
@property(nonatomic) BOOL manual;
@property(nonatomic) BOOL backgroundAfterDismiss;
- (void)requestRestart;
- (void)checkManually;
@end

static ClutterSparkleDriver *driver;

static void Notice(NSString *title, NSString *detail, NSAlertStyle style) {
    NSAlert *alert = [NSAlert new];
    alert.messageText = title;
    alert.informativeText = detail ?: @"";
    alert.alertStyle = style;
    [alert addButtonWithTitle:@"OK"];
    [alert runModal];
}

static BOOL Ask(NSString *version) {
    NSAlert *alert = [NSAlert new];
    alert.messageText = @"New update available";
    alert.informativeText = [NSString stringWithFormat:@"Version %@", version ?: @""];
    [alert addButtonWithTitle:@"Download and Install"];
    [alert addButtonWithTitle:@"Later"];
    return [alert runModal] == NSAlertFirstButtonReturn;
}

@implementation ClutterSparkleDriver
- (instancetype)init {
    if ((self = [super init])) {
        _phase = @"idle";
        _version = @"";
        _errorMessage = @"";
    }
    return self;
}

- (void)requestRestart {
    if ([self.phase isEqualToString:@"ready"] && self.install) {
        self.explicitInstall = YES;
        self.phase = @"restart_requested";
    } else if ([self.phase isEqualToString:@"downloaded"] && self.prepare) {
        self.explicitInstall = YES;
        void (^prepare)(void) = self.prepare;
        self.prepare = nil;
        self.phase = @"preparing";
        prepare();
    }
}

- (void)checkManually {
    if ([self.phase isEqualToString:@"ready"] || [self.phase isEqualToString:@"downloaded"]) {
        if (Ask(self.version)) [self requestRestart];
        return;
    }
    if (!self.updater.canCheckForUpdates || self.updater.sessionInProgress) {
        Notice(@"Clutter Update", @"An update check or download is already in progress.", NSAlertStyleInformational);
        return;
    }
    self.manual = YES;
    self.phase = @"checking";
    self.errorMessage = @"";
    [self.updater checkForUpdates];
}

- (void)showUpdatePermissionRequest:(SPUUpdatePermissionRequest *)request
                              reply:(void (^)(SUUpdatePermissionResponse *))reply {
    // Explicit Info.plist configuration normally prevents this prompt.
    reply([[SUUpdatePermissionResponse alloc] initWithAutomaticUpdateChecks:YES
        automaticUpdateDownloading:@YES sendSystemProfile:NO]);
}

- (void)showUserInitiatedUpdateCheckWithCancellation:(void (^)(void))cancellation {
    self.phase = @"checking";
    self.manual = YES;
}

- (void)showUpdateFoundWithAppcastItem:(SUAppcastItem *)item
                                state:(SPUUserUpdateState *)state
                                reply:(void (^)(SPUUserUpdateChoice))reply {
    self.version = item.displayVersionString;
    if (item.informationOnlyUpdate) {
        if (state.userInitiated) {
            Notice(@"Update information", @"This update cannot be installed automatically.", NSAlertStyleInformational);
        }
        reply(SPUUserUpdateChoiceDismiss);
        return;
    }
    BOOL install = state.userInitiated && Ask(self.version);
    self.explicitInstall = install;
    self.manual = state.userInitiated;

    if (state.stage == SPUUserUpdateStageInstalling) {
        // Already prepared by Sparkle. Keep the decision pending until safe close.
        self.install = ^{ reply(SPUUserUpdateChoiceInstall); };
        self.phase = install ? @"restart_requested" : @"ready";
    } else if (state.stage == SPUUserUpdateStageDownloaded) {
        // Authorization can be required here. Never start it from an automatic check.
        self.prepare = ^{ reply(SPUUserUpdateChoiceInstall); };
        self.phase = @"downloaded";
        if (install) [self requestRestart];
    } else if (install) {
        self.phase = @"downloading";
        reply(SPUUserUpdateChoiceInstall);
    } else {
        // Later on a manual check: give Sparkle back the session and ask its
        // automatic downloader to prepare the update, rather than prompting for authorization.
        self.backgroundAfterDismiss = state.userInitiated;
        self.phase = @"idle";
        reply(SPUUserUpdateChoiceDismiss);
    }
}

- (void)showUpdateReleaseNotesWithDownloadData:(SPUDownloadData *)downloadData {}
- (void)showUpdateReleaseNotesFailedToDownloadWithError:(NSError *)error {}

- (void)showUpdateNotFoundWithError:(NSError *)error acknowledgement:(void (^)(void))acknowledgement {
    NSNumber *reason = error.userInfo[SPUNoUpdateFoundReasonKey];
    if (reason.integerValue == SPUNoUpdateFoundReasonOnLatestVersion ||
        reason.integerValue == SPUNoUpdateFoundReasonOnNewerThanLatestVersion) {
        Notice(@"You're on the latest version of Clutter!",
            [NSBundle.mainBundle objectForInfoDictionaryKey:@"CFBundleShortVersionString"], NSAlertStyleInformational);
    } else {
        Notice(@"No compatible update available", error.localizedDescription, NSAlertStyleInformational);
    }
    self.phase = @"idle";
    self.manual = NO;
    acknowledgement();
}

- (void)showUpdaterError:(NSError *)error acknowledgement:(void (^)(void))acknowledgement {
    BOOL show = self.manual || self.explicitInstall;
    self.phase = @"failed";
    self.errorMessage = error.localizedDescription;
    self.prepare = nil;
    self.install = nil;
    self.explicitInstall = NO;
    self.manual = NO;
    if (show) Notice(@"Clutter Update", error.localizedDescription, NSAlertStyleWarning);
    acknowledgement();
}

- (void)showDownloadInitiatedWithCancellation:(void (^)(void))cancellation {
    self.phase = @"downloading";
}
- (void)showDownloadDidReceiveExpectedContentLength:(uint64_t)expectedContentLength {}
- (void)showDownloadDidReceiveDataOfLength:(uint64_t)length {}
- (void)showDownloadDidStartExtractingUpdate { self.phase = @"preparing"; }
- (void)showExtractionReceivedProgress:(double)progress {}

- (void)showReadyToInstallAndRelaunch:(void (^)(SPUUserUpdateChoice))reply {
    self.prepare = nil;
    self.install = ^{ reply(SPUUserUpdateChoiceInstall); };
    self.phase = self.explicitInstall ? @"restart_requested" : @"ready";
}

- (void)showInstallingUpdateWithApplicationTerminated:(BOOL)applicationTerminated
                         retryTerminatingApplication:(void (^)(void))retryTerminatingApplication {
    self.phase = @"installing";
}

- (void)showUpdateInstalledAndRelaunched:(BOOL)relaunched acknowledgement:(void (^)(void))acknowledgement {
    self.phase = @"idle";
    self.install = nil;
    self.prepare = nil;
    acknowledgement();
}

- (void)dismissUpdateInstallation {
    self.install = nil;
    self.prepare = nil;
    self.explicitInstall = NO;
    self.manual = NO;
    if (![self.phase isEqualToString:@"failed"]) self.phase = @"idle";
}

- (void)updater:(SPUUpdater *)updater willDownloadUpdate:(SUAppcastItem *)item
                                    withRequest:(NSMutableURLRequest *)request {
    self.version = item.displayVersionString;
    self.phase = @"downloading";
}

- (BOOL)updater:(SPUUpdater *)updater willInstallUpdateOnQuit:(SUAppcastItem *)item
                                 immediateInstallationBlock:(void (^)(void))immediateInstallHandler {
    // Automatic download and preparation succeeded. Sparkle can now install on
    // ordinary quit or on a deliberate restart after Clutter flushes its vault.
    self.version = item.displayVersionString;
    self.install = immediateInstallHandler;
    self.prepare = nil;
    self.phase = self.explicitInstall ? @"restart_requested" : @"ready";
    self.manual = NO;
    return YES;
}

- (BOOL)updater:(SPUUpdater *)updater shouldDownloadReleaseNotesForUpdate:(SUAppcastItem *)item {
    return NO;
}

- (void)updater:(SPUUpdater *)updater didFinishUpdateCycleForUpdateCheck:(SPUUpdateCheck)updateCheck
                                          error:(NSError *)error {
    if (self.backgroundAfterDismiss) {
        self.backgroundAfterDismiss = NO;
        self.manual = NO;
        self.explicitInstall = NO;
        dispatch_async(dispatch_get_main_queue(), ^{
            if (!updater.sessionInProgress) [updater checkForUpdatesInBackground];
        });
    }
    if (self.install || self.prepare || [self.phase isEqualToString:@"failed"]) return;
    if (error && error.code != SUNoUpdateError) {
        self.phase = @"failed";
        self.errorMessage = error.localizedDescription;
    } else {
        self.phase = @"idle";
    }
    self.manual = NO;
    self.explicitInstall = NO;
}
@end

// This narrow C ABI never accepts paths, keys, arbitrary selectors, or URLs from the webview.
char *clutter_sparkle_action(const char *action) {
    __block char *result = NULL;
    void (^work)(void) = ^{
        @autoreleasepool {
            NSString *command = [NSString stringWithUTF8String:action];
            NSString *failure = nil;
            if ([command isEqualToString:@"start"] && !driver) {
                driver = [ClutterSparkleDriver new];
                driver.updater = [[SPUUpdater alloc] initWithHostBundle:NSBundle.mainBundle
                    applicationBundle:NSBundle.mainBundle userDriver:driver delegate:driver];
                NSError *error = nil;
                if (![driver.updater startUpdater:&error]) {
                    failure = error.localizedDescription ?: @"Sparkle could not start.";
                    driver = nil;
                } else if (driver.updater.automaticallyChecksForUpdates) {
                    [driver.updater checkForUpdatesInBackground];
                }
            } else if (!driver) {
                failure = @"Sparkle has not started.";
            } else if ([command isEqualToString:@"check"]) {
                [driver checkManually];
            } else if ([command isEqualToString:@"restart"]) {
                [driver requestRestart];
            } else if ([command isEqualToString:@"cancel_restart"]) {
                if ([driver.phase isEqualToString:@"restart_requested"] && driver.install) {
                    driver.phase = @"ready";
                    driver.explicitInstall = NO;
                }
            } else if ([command isEqualToString:@"commit_restart"]) {
                if (![driver.phase isEqualToString:@"restart_requested"] || !driver.install) {
                    failure = @"No prepared update is awaiting restart.";
                } else {
                    void (^install)(void) = driver.install;
                    driver.install = nil;
                    driver.phase = @"installing";
                    install();
                }
            } else if (![command isEqualToString:@"status"] && ![command isEqualToString:@"start"]) {
                failure = @"Unknown updater action.";
            }
            NSDictionary *snapshot = @{
                @"phase": driver.phase ?: @"failed",
                @"version": driver.version ?: @"",
                @"error": failure ?: driver.errorMessage ?: @"",
                @"ok": @(failure == nil)
            };
            NSData *json = [NSJSONSerialization dataWithJSONObject:snapshot options:0 error:nil];
            NSString *string = [[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding];
            result = strdup(string.UTF8String ?: "{}");
        }
    };
    if (NSThread.isMainThread) work();
    else dispatch_sync(dispatch_get_main_queue(), work);
    return result;
}

void clutter_sparkle_free(char *value) { free(value); }
