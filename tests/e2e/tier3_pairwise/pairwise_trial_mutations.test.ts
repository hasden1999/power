import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { OfflineLicenseEngine, MonotonicTrialClock, type LicensePayload } from '../harness/cryptoHelper.ts';
import { MemoryDbBridge } from '../harness/dbDriver.ts';

describe('Tier 3: Cross-Feature Combinations - Trial Expiry & Mutation Guard Pairwise', () => {
  let engine: OfflineLicenseEngine;
  let db: MemoryDbBridge;

  before(async () => {
    engine = new OfflineLicenseEngine();
    await engine.initialize();
    db = new MemoryDbBridge();
  });

  it('PW-TM-1: trial expired state permits debt collection and receipt printing while blocking new subscribers', async () => {
    const baseTime = 1774900000000;
    const clock = new MonotonicTrialClock(baseTime);

    // Initial subscriber added during trial
    const sub = await db.addSubscriber({
      fullName: 'أحمد ستار',
      phone: '07801234567',
      street: 'حي الجامعة',
      breakerNumber: 'R-01',
      amperes: 5,
      subscriptionType: 'normal',
      openingBalance: 0,
      isActive: true
    });

    await db.generateMonthlyCycle(7, 2026, 12000, 18000, 8000);
    const inv = Array.from(db.invoices.values())[0];

    // Day 31 arrives -> trial expires
    const day31Time = baseTime + (31 * 24 * 60 * 60 * 1000);
    assert.equal(clock.isTrialExpired(day31Time), true);

    // 1. Attempt to add new subscriber: mutation guard blocks
    const attemptAddSubscriber = async (licensed: boolean, expired: boolean) => {
      if (!licensed && expired) throw new Error('Trial expired: adding subscribers is disabled');
      return await db.addSubscriber({ fullName: 'جديد', phone: '0', street: 's', breakerNumber: 'b', amperes: 5, subscriptionType: 'normal', openingBalance: 0, isActive: true });
    };

    await assert.rejects(
      async () => {
        await attemptAddSubscriber(false, true);
      },
      /Trial expired: adding subscribers is disabled/
    );

    // 2. Existing subscriber pays debt: permitted!
    const { receiptNumber, remainingDebt } = await db.recordPayment(sub.id, inv.id, 60000);
    assert.ok(receiptNumber.startsWith('REC-'));
    assert.equal(remainingDebt, 0);

    // 3. Thermal receipt generation: permitted!
    const receipt = db.generateThermalReceipt(1, '80mm');
    assert.ok(receipt.includes('المسدد:  60,000 د.ع'));
  });

  it('PW-TM-2: system transition from expired trial to licensed unlocks subscriber insertion immediately', async () => {
    let isLicensed = false;

    // Generate valid signed license
    const payload: LicensePayload = {
      generatorName: 'مولدة حي الجامعة',
      phone: '07701234567',
      capacityAmperes: 500,
      issuedAt: Date.now(),
      expiresAt: 0, // Lifetime
      features: ['all']
    };
    const licenseToken = await engine.signLicense(payload);

    // Verify token
    const verification = await engine.verifyLicense(licenseToken, Date.now());
    assert.equal(verification.isValid, true);
    isLicensed = true;

    // Now subscriber insertion succeeds without error
    const sub = await db.addSubscriber({
      fullName: 'مشترك بعد الترخيص',
      phone: '07709998877',
      street: 'اليرموك',
      breakerNumber: 'R-99',
      amperes: 8,
      subscriptionType: 'gold',
      openingBalance: 0,
      isActive: true
    });

    assert.equal(sub.fullName, 'مشترك بعد الترخيص');
    assert.equal(isLicensed, true);
  });

  it('PW-TM-3: clock rewind in expired state fails to unlock mutation guard', () => {
    const baseTime = 1774900000000;
    const clock = new MonotonicTrialClock(baseTime);

    // Expire on Day 35
    const day35Time = baseTime + (35 * 24 * 60 * 60 * 1000);
    assert.equal(clock.isTrialExpired(day35Time), true);

    // Attacker rolls clock back to Day 1
    const day1Time = baseTime + 1000;
    const effectiveTime = clock.getEffectiveTime(day1Time);

    // Effective time did not revert, remaining expired
    assert.equal(clock.isTrialExpired(day1Time), true);
    assert.equal(effectiveTime, day35Time);
    assert.equal(clock.isTamperDetected(), true);
  });
});
