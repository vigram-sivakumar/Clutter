import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// ADR-067: the welcome content has exactly one gate in front of a Welcome Space, exactly one way to be marked as
// created by the Welcome flow, and it can never be reached from anywhere else. Enforced against the source, like the
// collection scroll contract.
const SRC = path.resolve(__dirname, '../..');
const appShell = fs.readFileSync(path.join(SRC, 'app/AppShell.tsx'), 'utf8');
const spaceDetails = fs.readFileSync(path.join(SRC, 'components/space-details/SpaceDetails.tsx'), 'utf8');

describe('welcome content triggers (ADR-067)', () => {
  it('createdByWelcomeRef is set in exactly one place: the Welcome dialog Create handler, from the created folder', () => {
    const assignments = [...appShell.matchAll(/createdByWelcomeRef\.current = (?!null)/g)];
    expect(assignments).toHaveLength(1);

    const handler = appShell.slice(appShell.indexOf('async function createFolderOrOpenChosen'));
    const handlerBody = handler.slice(0, handler.indexOf('\n  }\n'));
    expect(handlerBody).toContain("createdByWelcomeRef.current = normalizeSpacePath(outcome.path)");
    expect(handlerBody).toContain("'path' in outcome");
  });

  it('the gate runs once, only for a Welcome open, BEFORE the Application is handed to the UI and the Space is remembered', () => {
    expect(appShell.match(/prepareWelcomeSpace\(/g)).toHaveLength(1);
    const gate = appShell.indexOf('prepareWelcomeSpace(');

    expect(gate).toBeGreaterThan(appShell.indexOf('const gatedByWelcome = onboardingForGate?.path === openPath'));
    expect(gate).toBeLessThan(appShell.indexOf('setApplication(prepared);\n      setError(null)'));
    expect(gate).toBeLessThan(appShell.indexOf('spaces.confirmOpened()'));
    // A closed gate throws, so the open sequence's own failure path discards the Application and keeps the dialog.
    expect(appShell).toContain('if (!gate.open) throw new WelcomeInstallIncompleteError(gate.message)');
  });

  it('a closed gate leaves the folder claimed as created (so the retry resumes) and shows its message in the dialog', () => {
    expect(appShell).toContain('const unfinishedInstall = loadError instanceof WelcomeInstallIncompleteError');
    expect(appShell).toContain('if (!unfinishedInstall && createdByWelcomeRef.current === openPath) createdByWelcomeRef.current = null');
    expect(appShell).toContain('unfinishedInstall\n              ? loadError.message');
  });

  it('only a Space opened outside the Welcome dialog resumes in the background, after it is open and remembered', () => {
    expect(appShell.match(/resumeInterruptedWelcomeContent\(/g)).toHaveLength(1);
    const background = appShell.indexOf('resumeInterruptedWelcomeContent(');

    expect(background).toBeGreaterThan(appShell.indexOf('spaces.confirmOpened()'));
    expect(appShell.slice(appShell.indexOf('if (onboarding && onboarding.path === openPath) {'), background)).toContain('} else {');
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
  });

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
