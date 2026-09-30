import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { OfflineLicenseEngine, MonotonicTrialClock, type LicensePayload } from '../harness/cryptoHelper.ts';
import { MemoryDbBridge } from '../harness/dbDriver.ts';

describe('Tier 4: Scenario 2 - 30-Day Trial Expiration & Offline License Activation', () => {
  let engine: OfflineLicenseEngine;
  let db: MemoryDbBridge;

  before(async () => {
    engine = new OfflineLicenseEngine();
    await engine.initialize();
    db = new MemoryDbBridge();
  });

  it('runs trial expiration on Day 31, blocks subscriber insertion, collects debt, and activates lifetime license', async () => {
    const day1Time = 1774900000000;
    const clock = new MonotonicTrialClock(day1Time);

    // Initial subscriber added during free trial
    const sub = await db.addSubscriber({
      fullName: 'كرار حيدر الشمري',
      phone: '07701234567',
      street: 'حي الجامعة',
      breakerNumber: 'R-01',
      amperes: 5,
      subscriptionType: 'normal',
      openingBalance: 0,
      isActive: true
    });

    await db.generateMonthlyCycle(7, 2026, 12000, 18000, 8000);
    const invoice = Array.from(db.invoices.values())[0];

    // --- DAY 31 ARRIVES WITHOUT INTERNET ---
    const day31Time = day1Time + (31 * 24 * 60 * 60 * 1000);
    assert.equal(clock.isTrialExpired(day31Time), true);
    assert.equal(clock.getDaysRemaining(day31Time), 0);

    let isLicensed = false;

    // Guard function
    const assertCanMutateCore = (action: string) => {
      if (!isLicensed && clock.isTrialExpired(day31Time)) {
        if (action === 'insert_subscriber' || action === 'insert_cycle') {
          throw new Error('انتهت الفترة التجريبية (30 يوماً). يُرجى إدخال كود الترخيص لمتابعة إضافة المشتركين.');
        }
      }
    };

    // 1. Operator attempts to add a 2nd subscriber -> BLOCKED with friendly Arabic message
    assert.throws(
      () => {
        assertCanMutateCore('insert_subscriber');
      },
      /انتهت الفترة التجريبية/
    );

    // 2. Existing debtor comes to pay: ALLOWED and receipt generated!
    const { receiptNumber, remainingDebt } = await db.recordPayment(sub.id, invoice.id, 60000);
    assert.ok(receiptNumber.startsWith('REC-2026-AMP-'));
    assert.equal(remainingDebt, 0);

    const receiptText = db.generateThermalReceipt(1, '80mm');
    assert.ok(receiptText.includes('المسدد:  60,000 د.ع'));

    // 3. Operator purchases permanent license from platform provider
    // Provider runs CLI key generator and signs token
    const licensePayload: LicensePayload = {
      generatorName: 'مولدة حي الجامعة الأهلية 1',
      phone: '07709876543',
      capacityAmperes: 500,
      issuedAt: day31Time,
      expiresAt: 0, // Lifetime license
      features: ['all']
    };

    const licenseToken = await engine.signLicense(licensePayload);
    assert.ok(licenseToken.startsWith('AMP1.'));

    // 4. Operator enters token into offline application Settings screen
    const validation = await engine.verifyLicense(licenseToken, day31Time);
    assert.equal(validation.isValid, true);
    assert.equal(validation.payload?.generatorName, 'مولدة حي الجامعة الأهلية 1');

    // 5. System activates license state
    isLicensed = true;

    // 6. Operator can now add new subscribers smoothly!
    assert.doesNotThrow(() => {
      assertCanMutateCore('insert_subscriber');
    });

    const newSub = await db.addSubscriber({
      fullName: 'أحمد ستار الجبوري (مشترك بعد التفعيل)',
      phone: '07802223333',
      street: 'حي الجامعة',
      breakerNumber: 'R-02',
      amperes: 8,
      subscriptionType: 'gold',
      openingBalance: 0,
      isActive: true
    });

    assert.equal(newSub.fullName, 'أحمد ستار الجبوري (مشترك بعد التفعيل)');
    assert.equal(db.subscribers.size, 2);
  });
});
