import { describe, it, expect } from 'vitest';
import { installAdvice } from '../src/ui/install';
import type { InstallEnv } from '../src/ui/install';

const UA = {
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0',
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1',
  ipadOs:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  instagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 331.0.0.28.106',
  facebook:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 [FBAN/FB4A;FBAV/468.0.0.0;]',
  desktopChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};

const env = (over: Partial<InstallEnv>): InstallEnv => ({
  standalone: false,
  canPrompt: false,
  ua: UA.desktopChrome,
  touch: false,
  ...over,
});

describe('installAdvice', () => {
  it('offers a one-tap button when the browser gives us the prompt', () => {
    const a = installAdvice(env({ ua: UA.androidChrome, canPrompt: true, touch: true }));
    expect(a.state).toBe('prompt');
    expect(a.button).toBe('Install Hearth');
  });

  it('reports the installed app and offers no button', () => {
    const a = installAdvice(env({ standalone: true, ua: UA.androidChrome, touch: true }));
    expect(a.state).toBe('installed');
    expect(a.button).toBeNull();
  });

  it('walks iOS Safari through Share -> Add to Home Screen', () => {
    const a = installAdvice(env({ ua: UA.iphoneSafari, touch: true }));
    expect(a.state).toBe('ios');
    expect(a.body).toContain('Add to Home Screen');
    expect(a.button).toBeNull();
  });

  it('sends iOS Chrome to Safari, which is the only browser that can install', () => {
    const a = installAdvice(env({ ua: UA.iphoneChrome, touch: true }));
    expect(a.state).toBe('ios-other-browser');
    expect(a.body).toContain('Safari');
  });

  it('treats iPadOS as iOS even though it claims to be a Macintosh', () => {
    expect(installAdvice(env({ ua: UA.ipadOs, touch: true })).state).toBe('ios');
    // ...but a real Mac (no touch) is still the desktop case.
    expect(installAdvice(env({ ua: UA.ipadOs, touch: false })).state).toBe('manual-desktop');
  });

  // The most common "your link is broken" report: a social-app webview, which
  // can neither fire the prompt nor show an install menu item.
  it('tells in-app browsers to reopen in a real browser', () => {
    for (const ua of [UA.instagram, UA.facebook]) {
      const a = installAdvice(env({ ua, touch: true }));
      expect(a.state).toBe('in-app-browser');
      expect(a.body).toContain('Open in browser');
    }
  });

  it('prefers the in-app-browser steps even if a prompt somehow exists', () => {
    const a = installAdvice(env({ ua: UA.facebook, canPrompt: true, touch: true }));
    expect(a.state).toBe('in-app-browser');
  });

  it('gives Android browsers without a prompt the menu route', () => {
    const a = installAdvice(env({ ua: UA.androidFirefox, touch: true }));
    expect(a.state).toBe('manual-android');
    expect(a.body).toContain('Add to Home screen');
  });

  it('falls back to desktop guidance', () => {
    expect(installAdvice(env({})).state).toBe('manual-desktop');
  });

  // The whole point of the Settings row: no branch may leave the player with
  // nothing to do. Every state must carry real, non-empty guidance.
  it('always produces a title and actionable body', () => {
    const cases: InstallEnv[] = [
      env({ standalone: true }),
      env({ canPrompt: true }),
      env({ ua: UA.iphoneSafari, touch: true }),
      env({ ua: UA.iphoneChrome, touch: true }),
      env({ ua: UA.instagram, touch: true }),
      env({ ua: UA.androidFirefox, touch: true }),
      env({}),
    ];
    for (const c of cases) {
      const a = installAdvice(c);
      expect(a.title.length).toBeGreaterThan(10);
      expect(a.body.length).toBeGreaterThan(30);
    }
  });
});
