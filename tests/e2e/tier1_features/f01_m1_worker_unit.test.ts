import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { platform, getDatabaseInitConfig, getInstallSnoozeState, snoozeInstallPrompt, clearInstallSnooze } from '../../../src/platform.ts';
import { APP_CONFIG } from '../../../src/config/app-config.ts';
import { AR_INSTALL_TEXTS, INSTALL_CONFIG } from '../../../src/config/install-texts.ts';

describe('M1 Worker Unit Verification: Platform, Config & Text Isolation', () => {

  it('verifies APP_CONFIG values match project specification', () => {
    assert.equal(APP_CONFIG.name, 'أمبيرجي (نظام إدارة المولدات الأهلية)');
    assert.equal(APP_CONFIG.shortName, 'أمبيرجي');
    assert.equal(APP_CONFIG.themeColor, '#0E7490');
    assert.equal(APP_CONFIG.backgroundColor, '#0f172a');
    assert.equal(APP_CONFIG.trialDays, 30);
    assert.equal(APP_CONFIG.installSnoozeDays, 3);
    assert.equal(APP_CONFIG.storageKeys.installSnoozeUntil, 'ampereji_install_snooze_until');
    assert.equal(APP_CONFIG.storageKeys.demoMode, 'ampereji_demo_mode');
    assert.equal(APP_CONFIG.limits.maxWasmCacheBytes, 6 * 1024 * 1024);
    assert.equal(APP_CONFIG.limits.touchTargetMinSizePx, 44);
  });

  it('verifies AR_INSTALL_TEXTS and INSTALL_CONFIG text isolation', () => {
    assert.equal(INSTALL_CONFIG.SNOOZE_DURATION_DAYS, 3);
    assert.equal(INSTALL_CONFIG.SNOOZE_STORAGE_KEY, 'ampereji_install_snooze_until');
    assert.equal(INSTALL_CONFIG.PRIMARY_COLOR, '#0E7490');

    assert.ok(AR_INSTALL_TEXTS.banner.title.includes('أمبيرجي'));
    assert.equal(AR_INSTALL_TEXTS.banner.buttons.snooze, 'لاحقاً (تأجيل 3 أيام)');
    assert.ok(AR_INSTALL_TEXTS.iosGuide.steps.length >= 3);
    assert.ok(AR_INSTALL_TEXTS.ephemeralWarning.message.includes(':memory:'));
  });

  it('verifies platform evaluation in Node environment returns safe defaults', () => {
    const info = platform.getPlatformInfo();
    assert.equal(info.isStandalone, false);
    assert.equal(info.displayMode, 'browser');
    assert.equal(info.recommendedStorageMode, 'memory');
  });

  it('verifies getDatabaseInitConfig returns :memory: when uninstalled', () => {
    const dbConfig = getDatabaseInitConfig();
    assert.equal(dbConfig.filename, ':memory:');
    assert.equal(dbConfig.vfs, 'memdb');
    assert.equal(dbConfig.isEphemeral, true);
  });

  it('verifies snooze state handling with mock or missing storage', () => {
    // In Node.js environment where localStorage is undefined
    const snoozeState = getInstallSnoozeState();
    assert.equal(snoozeState.isSnoozed, false);
    assert.equal(snoozeState.snoozeUntil, null);
    assert.equal(snoozeState.remainingHours, 0);

    // Calling snooze methods in Node.js does not throw
    assert.doesNotThrow(() => {
      snoozeInstallPrompt(3);
      clearInstallSnooze();
    });
  });

  it('verifies platform subscription listener pattern', () => {
    let callCount = 0;
    const unsub = platform.subscribe((info) => {
      callCount++;
      assert.ok(typeof info.isStandalone === 'boolean');
    });
    assert.equal(callCount, 1);
    unsub();
  });
});
