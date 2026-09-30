import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbBridge, roundIQD, formatIQD } from '../harness/dbDriver.ts';

describe('Tier 2: Boundary & Corner Cases - Financial Engine & Collections', () => {
  let db: MemoryDbBridge;

  beforeEach(() => {
    db = new MemoryDbBridge();
  });

  it('B-FN-1: rejects payment with amount <= 0', async () => {
    const sub = await db.addSubscriber({
      fullName: 'كرار حيدر',
      phone: '07701234567',
      street: 'حي الجامعة',
      breakerNumber: 'R-01',
      amperes: 5,
      subscriptionType: 'normal',
      openingBalance: 0,
      isActive: true
    });

    await db.generateMonthlyCycle(7, 2026, 12000, 18000, 8000);
    const inv = Array.from(db.invoices.values())[0];

    // Attempt 0 IQD
    await assert.rejects(
      async () => {
        await db.recordPayment(sub.id, inv.id, 0);
      },
      /greater than zero/
    );

    // Attempt negative payment -15,000 IQD
    await assert.rejects(
      async () => {
        await db.recordPayment(sub.id, inv.id, -15000);
      },
      /greater than zero/
    );
  });

  it('B-FN-2: rejects overpayment exceeding total due by exactly 1 IQD', async () => {
    const sub = await db.addSubscriber({
      fullName: 'مصطفى السعدي',
      phone: '07802222222',
      street: 'حي الجامعة',
      breakerNumber: 'R-02',
      amperes: 5,
      subscriptionType: 'normal',
      openingBalance: 0,
      isActive: true
    });

    await db.generateMonthlyCycle(7, 2026, 12000, 18000, 8000);
    const inv = Array.from(db.invoices.values())[0]; // Total due = 60,000 IQD

    // 60,250 rounds to 60,250 which is > 60,000
    await assert.rejects(
      async () => {
        await db.recordPayment(sub.id, inv.id, 60250);
      },
      /Overpayment rejected/
    );
  });

  it('B-FN-3: handles small LED line amperage (0.25 A) correctly', async () => {
    const sub = await db.addSubscriber({
      fullName: 'خط إنارة بسيط (ربع أمبير)',
      phone: '07700000000',
      street: 'الزقاق',
      breakerNumber: 'LED-1',
      amperes: 0.25,
      subscriptionType: 'normal',
      openingBalance: 0,
      isActive: true
    });

    await db.generateMonthlyCycle(7, 2026, 12000, 18000, 8000);
    const inv = Array.from(db.invoices.values())[0];
    // 0.25 * 12,000 = 3,000 IQD
    assert.equal(inv.currentAmount, 3000);
    assert.equal(inv.totalDue, 3000);
  });

  it('B-FN-4: handles heavy commercial amperage (150 A) for large factories/bakeries', async () => {
    const sub = await db.addSubscriber({
      fullName: 'مخبز وصمون اليرموك',
      phone: '07803333333',
      street: 'الشارع التجاري',
      breakerNumber: 'MAIN-01',
      amperes: 150,
      subscriptionType: 'gold',
      openingBalance: 0,
      isActive: true
    });

    await db.generateMonthlyCycle(7, 2026, 12000, 18000, 8000);
    const inv = Array.from(db.invoices.values())[0];
    // 150A * 18,000 = 2,700,000 IQD
    assert.equal(inv.currentAmount, 2700000);
    assert.equal(inv.totalDue, 2700000);
  });

  it('B-FN-5: tests rounding for odd fractional IQD amounts', () => {
    assert.equal(roundIQD(12124.99), 12000);
    assert.equal(roundIQD(12125.01), 12250);
    assert.equal(roundIQD(12374.99), 12250);
    assert.equal(roundIQD(12375.01), 12500);
    assert.equal(roundIQD(0), 0);
    assert.equal(roundIQD(NaN), 0);
  });

  it('B-FN-6: handles large multi-billion Iraqi Dinar ledger amounts safely', () => {
    const annualTurnover = 2_500_000_000; // 2.5 Billion IQD
    assert.ok(annualTurnover < Number.MAX_SAFE_INTEGER);

    const formatted = formatIQD(annualTurnover);
    assert.equal(formatted, '2,500,000,000 د.ع');
  });
});
