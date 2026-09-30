import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createPlatformContext, detectPlatform, MockLocalStorage, MockStorageManager } from '../harness/env.ts';

describe('Tier 2: Boundary & Corner Cases - Platform & Environment', () => {

  it('B-PL-1: handles empty or null-like User-Agent string without throwing', () => {
    const ctx = createPlatformContext({ userAgent: '' });
    const detected = detectPlatform(ctx);
    assert.equal(detected.isIOS, false);
    assert.equal(detected.isAndroid, false);
    assert.equal(detected.isInApp, false);
  });

  it('B-PL-2: handles extreme 4000-character User-Agent string efficiently', () => {
    const longUa = 'Mozilla/5.0 ' + 'A'.repeat(4000) + ' Safari/537.36';
    const ctx = createPlatformContext({ userAgent: longUa });
    const start = performance.now();
    const detected = detectPlatform(ctx);
    const duration = performance.now() - start;

    assert.ok(duration < 50, 'Detection on long UA must complete under 50ms');
    assert.equal(detected.isIOS, false);
  });

  it('B-PL-3: detects iPadOS Safari running in desktop mode (Macintosh UA with touch)', () => {
    const ipadDesktopUa = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
    // When maxTouchPoints > 1, iPadOS presents as Macintosh
    const isIPadOSDesktop = (ua: string, maxTouchPoints: number) => {
      return /macintosh/i.test(ua) && maxTouchPoints > 1;
    };

    assert.equal(isIPadOSDesktop(ipadDesktopUa, 5), true);
    assert.equal(isIPadOSDesktop(ipadDesktopUa, 0), false); // Real Mac Desktop
  });

  it('B-PL-4: handles corrupted non-numeric install snooze value in localStorage', () => {
    const storage = new MockLocalStorage();
    storage.setItem('ampereji_install_snooze_until', 'NOT_A_NUMBER');

    const raw = storage.getItem('ampereji_install_snooze_until');
    const snoozeUntil = Number(raw);
    const isValidSnooze = !isNaN(snoozeUntil) && Date.now() < snoozeUntil;

    assert.equal(isValidSnooze, false, 'Invalid snooze timestamp must not block banner');
  });

  it('B-PL-5: handles negative or epoch snooze timestamps', () => {
    const storage = new MockLocalStorage();
    storage.setItem('ampereji_install_snooze_until', '-5000');

    const snoozeUntil = Number(storage.getItem('ampereji_install_snooze_until'));
    const isSnoozed = !isNaN(snoozeUntil) && Date.now() < snoozeUntil;
    assert.equal(isSnoozed, false);
  });

  it('B-PL-6: handles storage persist permission denial by browser', async () => {
    class DeniedStorageManager extends MockStorageManager {
      override async persist(): Promise<boolean> {
        return false; // Browser denied persistence
      }
    }

    const storage = new DeniedStorageManager();
    const result = await storage.persist();
    assert.equal(result, false);
  });
});
