import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbBridge, formatIQD } from '../harness/dbDriver.ts';
import { IRAQI_NAMES, IRAQI_NEIGHBORHOODS, DEFAULT_GENERATOR_CONFIG } from '../harness/iraqiFixtures.ts';

describe('Tier 4: Scenario 1 - Al-Jami\'a Neighborhood 30-Day Launch', () => {

  it('executes full 30-day lifecycle for Al-Jami\'a generator: onboarding 50 subscribers, billing, diesel refills, balance sheet', async () => {
    const db = new MemoryDbBridge();

    // 1. Operator Onboards 50 Subscribers
    for (let i = 1; i <= 50; i++) {
      const name = IRAQI_NAMES[(i - 1) % IRAQI_NAMES.length] + ` (${i})`;
      const street = IRAQI_NEIGHBORHOODS[(i - 1) % IRAQI_NEIGHBORHOODS.length];
      const isGold = i % 5 === 0; // 10 gold subscribers, 40 normal
      const amperes = isGold ? 10 : 5;
      const type = isGold ? 'gold' : 'normal';

      await db.addSubscriber({
        fullName: name,
        phone: `0770${String(i).padStart(7, '0')}`,
        street,
        breakerNumber: `B-${String(i).padStart(2, '0')}`,
        amperes,
        subscriptionType: type,
        openingBalance: i % 10 === 0 ? 10000 : 0, // Some initial debts
        isActive: true
      });
    }

    assert.equal(db.subscribers.size, 50);

    // 2. Issue Month 7 Billing Cycle
    // Normal: 12,000 IQD, Gold: 18,000 IQD
    const { cycle, invoicesGenerated } = await db.generateMonthlyCycle(
      7,
      2026,
      DEFAULT_GENERATOR_CONFIG.defaultPriceNormal,
      DEFAULT_GENERATOR_CONFIG.defaultPriceGold,
      DEFAULT_GENERATOR_CONFIG.defaultPriceNight
    );

    assert.equal(invoicesGenerated, 50);
    assert.equal(cycle.month, 7);

    // Verify invoice calculations:
    // 40 normal subs: 5A * 12,000 = 60,000 each = 2,400,000
    // 10 gold subs: 10A * 18,000 = 180,000 each = 1,800,000
    // 5 subs had 10,000 opening debt = 50,000
    // Total due expected = 2,400,000 + 1,800,000 + 50,000 = 4,250,000 IQD
    const totalDueSum = Array.from(db.invoices.values()).reduce((sum, inv) => sum + inv.totalDue, 0);
    assert.equal(totalDueSum, 4250000);

    // 3. Daily Field Collection: 40 subscribers pay in full, 10 carry over debt
    let receiptCount = 0;
    const invoices = Array.from(db.invoices.values());
    for (let i = 0; i < 40; i++) {
      const inv = invoices[i];
      const { receiptNumber, remainingDebt } = await db.recordPayment(inv.subscriberId, inv.id, inv.totalDue);
      assert.ok(receiptNumber.startsWith('REC-2026-AMP-'));
      assert.equal(remainingDebt, 0);
      receiptCount++;
    }
    assert.equal(receiptCount, 40);

    // 4. Log Diesel Purchases and Generator Maintenance
    // Refill 1: 1500L diesel @ 750 IQD = 1,125,000 IQD
    await db.addExpense({
      category: 'fuel',
      title: 'شراء صهريج كاز أول',
      amount: 1125000,
      liters: 1500,
      date: '2026-07-05',
      notes: 'وصل تجهيز محطة اليرموك'
    });

    // Refill 2: 1500L diesel @ 750 IQD = 1,125,000 IQD
    await db.addExpense({
      category: 'fuel',
      title: 'شراء صهريج كاز ثان',
      amount: 1125000,
      liters: 1500,
      date: '2026-07-18',
      notes: 'وصل تجهيز محطة اليرموك'
    });

    // Oil and filters change: 160,000 IQD
    await db.addExpense({
      category: 'oil_maintenance',
      title: 'تبديل دهن 20W50 مع الفلاتر',
      amount: 160000,
      date: '2026-07-12'
    });

    // 5. Generate End of Month Balance Sheet & Audit
    const report = db.getMonthlyReport(7, 2026);
    assert.equal(report.fuelLiters, 3000);
    assert.equal(report.fuelExpenses, 2250000);
    assert.equal(report.totalExpenses, 2410000); // 2,250,000 + 160,000
    assert.equal(report.averageDieselPrice, 750);

    // 40 subs paid:
    // (32 normal subs paid 60,000 = 1,920,000)
    // (8 gold subs paid 180,000 = 1,440,000)
    // plus opening balances for those who paid
    assert.ok(report.totalCollected > 3000000);
    assert.ok(report.totalDebt > 0);
    assert.ok(report.netProfit > 0, 'Al-Jami\'a generator operated at a profit');

    // 6. Print Sample Thermal Receipt for Paid Subscriber
    const receipt = db.generateThermalReceipt(1, '80mm');
    assert.ok(receipt.includes('وصل قبض كهرباء - مولدة أهلية'));
    assert.ok(receipt.includes('المسدد:'));
  });
});
