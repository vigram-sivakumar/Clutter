import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// ADR-067: the welcome content has exactly one gate in front of a Welcome Space, exactly one way to be marked as
// created by the Welcome flow, and it can never be reached from anywhere else. Enforced against the source, like the
// collection scroll contract.
const SRC = path.resolve(__dirname, '../..');
const appShell = fs.readFileSync(path.join(SRC, 'app/AppShell.tsx'), 'utf8');
const spaceDetails = fs.readFileSync(path.join(SRC, 'components/space-details/SpaceDetails.tsx'), 'utf8');

describe('welcome content triggers (ADR-070)', () => {
  it('the creation entry point decides: there is no created-by-Welcome flag, no first-run record and no background resume', () => {
    expect(appShell).not.toContain('createdByWelcomeRef');
    expect(appShell).not.toContain('resumeInterruptedWelcomeContent');
    expect(appShell).not.toContain('welcomeContentRecord');
    expect(fs.existsSync(path.join(SRC, 'app/spaces/welcomeContentRecord.ts'))).toBe(false);
  });

  it('the gate runs once, only for a Welcome open, BEFORE the Application is handed to the UI and the Space is remembered', () => {
    expect(appShell.match(/prepareWelcomeSpace\(/g)).toHaveLength(1);
    const gate = appShell.indexOf('prepareWelcomeSpace(');

    expect(gate).toBeGreaterThan(appShell.indexOf('const gatedByWelcome = onboardingForGate?.path === openPath'));
    expect(appShell.slice(appShell.indexOf('if (gatedByWelcome) {'), gate)).not.toContain('} else {');
    expect(gate).toBeLessThan(appShell.indexOf('setApplication(prepared);\n      setError(null)'));
    expect(gate).toBeLessThan(appShell.indexOf('spaces.confirmOpened()'));
    // A closed gate throws, so the open sequence's own failure path discards the Application and keeps the dialog.
    expect(appShell).toContain('if (!gate.open) throw new WelcomeInstallIncompleteError(gate.message)');
    // Only a Space that was just populated opens on the welcome folder.
    expect(appShell).toContain('if (gate.installed) await openWelcomeFolder(prepared, openPath);');
  });

  it('a Space is "from the Welcome Screen" only when the Welcome dialog is the one opening it; the sidebar flow never reaches the gate', () => {
    // The gate condition is the Welcome dialog's own pending open (`onboardingRef`), set only by `openSpaceFromWelcome`.
    expect(appShell.match(/onboardingRef\.current = \{/g)).toHaveLength(1);
    const setter = appShell.slice(appShell.indexOf('async function openSpaceFromWelcome('));
    expect(setter.slice(0, setter.indexOf('\n  }\n'))).toContain('onboardingRef.current = {');
    // The sidebar's Space details dialog has no create handler and its open goes through `confirmPendingSpace`.
    const sidebarDetails = appShell.slice(appShell.indexOf('<SpaceDetails'));
    const sidebarProps = sidebarDetails.slice(0, sidebarDetails.indexOf('/>'));
    expect(sidebarProps).not.toContain('onCreateFolder');
    expect(sidebarProps).toContain('onOpenSpace={confirmPendingSpace}');
    const confirm = appShell.slice(appShell.indexOf('async function confirmPendingSpace('));
    expect(confirm.slice(0, confirm.indexOf('\n  }\n'))).not.toContain('openSpaceFromWelcome');
  });

  it('a closed gate shows its message in the dialog, which stays up; the retry is another Welcome open of the same folder', () => {
    expect(appShell).toContain('const unfinishedInstall = loadError instanceof WelcomeInstallIncompleteError');
    expect(appShell).toContain('unfinishedInstall\n              ? loadError.message');
  });

  it('nothing else in the app calls the service, and Application constructs it once', () => {
    const offenders: string[] = [];
    const visit = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) visit(full);
        else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
          const text = fs.readFileSync(full, 'utf8');
          const rel = path.relative(SRC, full);
          if (/welcomeContentService\.(install|resumeIfNeeded|verifyInstall|markShown)\(/.test(text) && rel !== path.join('app', 'spaces', 'runWelcomeContent.ts')) offenders.push(rel);
        }
      }
    };
    visit(SRC);

    expect(offenders).toEqual([]);
    const application = fs.readFileSync(path.join(SRC, 'core/application/Application.ts'), 'utf8');
    expect(application.match(/new WelcomeContentService\(/g)).toHaveLength(1);
  }, 30_000);

  it('Create cannot be started twice: the button is disabled and says so while the space is being created and opened', () => {
    expect(spaceDetails).toContain('disabled={isCreating}');
    expect(spaceDetails).toContain("{isCreating ? 'Creating…' : 'Create'}");
    expect(spaceDetails).toContain('if (isCreating) return;');
  });

  it('a failed open keeps the created folder, so the next Create resumes it instead of creating another', () => {
    expect(spaceDetails).toContain('let path = createdPath ?? draft.existingPath ?? null;');
    expect(spaceDetails).toContain('setCreatedPath(path);');
  });
});
