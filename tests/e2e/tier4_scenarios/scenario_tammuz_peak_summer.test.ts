import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbBridge, formatIQD } from '../harness/dbDriver.ts';

describe('Tier 4: Scenario 4 - Iraqi Summer Peak (تموز / آب) & Fuel Auditing', () => {

  it('manages 50°C summer load: amperage surge, fuel volatility, capacity overload monitoring and Ministry of Oil CSV audit', async () => {
    const db = new MemoryDbBridge();
    const generatorKva = 500; // 500 kVA generator

    // 1. Summer heat starts: 30 subscribers upgrade from 4A to 8A for AC units
    for (let i = 1; i <= 30; i++) {
      await db.addSubscriber({
        fullName: `مشترك تموز ${i}`,
        phone: `0770${String(i).padStart(7, '0')}`,
        street: 'حي الجامعة - شارع المكيفات',
        breakerNumber: `B-${i}`,
        amperes: 8, // Upgraded for AC
        subscriptionType: 'gold', // 24h cooling line
        openingBalance: 0,
        isActive: true
      });
    }

    // 2. Capacity overload check: 30 * 8 = 240 Amperes
    const totalAmperes = Array.from(db.subscribers.values()).reduce((sum, s) => sum + s.amperes, 0);
    assert.equal(totalAmperes, 240);

    const checkCapacity = (amps: number, kva: number) => {
      const safeThreshold = kva * 1.2 * 0.80; // 80% safe continuous load
      const isOverloaded = amps > safeThreshold;
      return { isOverloaded, safeThreshold };
    };

    const status1 = checkCapacity(totalAmperes, generatorKva);
    assert.equal(status1.isOverloaded, false);

    // 3. 20 more commercial subscribers join with 15A each -> +300A (Total = 540A)
    for (let i = 31; i <= 50; i++) {
      await db.addSubscriber({
        fullName: `محل تجاري ${i}`,
        phone: `0780${String(i).padStart(7, '0')}`,
        street: 'الشارع التجاري',
        breakerNumber: `COMM-${i}`,
        amperes: 15,
        subscriptionType: 'normal',
        openingBalance: 0,
        isActive: true
      });
    }

    const updatedTotalAmps = Array.from(db.subscribers.values()).reduce((sum, s) => sum + s.amperes, 0);
    assert.equal(updatedTotalAmps, 540); // 240 + 300 = 540A

    const status2 = checkCapacity(updatedTotalAmps, generatorKva);
    assert.equal(status2.isOverloaded, true, 'Should trigger overload warning when safe threshold exceeded');

    // 4. Volatile Summer Diesel Purchases: Extreme fuel consumption (1,000L every 3 days @ 850 IQD)
    for (let day = 1; day <= 28; day += 7) {
      const dateStr = `2026-07-${String(day).padStart(2, '0')}`;
      await db.addExpense({
        category: 'fuel',
        title: `شراء وجبة كاز صيفية ليوم ${day}`,
        amount: 850000,
        liters: 1000,
        date: dateStr,
        notes: 'سعر السوق التجاري 850 د.ع للتر في ذروة تموز'
      });
    }
    assert.equal(db.expenses.size, 4); // 4,000 Liters = 3,400,000 IQD

    // 5. Monthly Billing Cycle Generation for Tammuz (Month 7)
    // Gold: 18,000 IQD/A, Normal: 12,000 IQD/A
    await db.generateMonthlyCycle(7, 2026, 12000, 18000, 8000);
    assert.equal(db.invoices.size, 50);

    // 6. Partial payments and debt scheduling
    let collectedSum = 0;
    const invoices = Array.from(db.invoices.values());
    for (const inv of invoices) {
      // Commercial pay full, residential pay 50%
      const payAmount = inv.amperes === 15 ? inv.totalDue : Math.round(inv.totalDue / 2);
      await db.recordPayment(inv.subscriberId, inv.id, payAmount);
      collectedSum += payAmount;
    }

    const report = db.getMonthlyReport(7, 2026);
    assert.equal(report.fuelLiters, 4000);
    assert.equal(report.fuelExpenses, 3400000);
    assert.equal(report.averageDieselPrice, 850);
    assert.equal(report.totalCollected, collectedSum);
    assert.ok(report.totalDebt > 0);

    // 7. Full Arabic CSV Export for Iraqi Ministry of Oil audit committee
    const csvData = db.exportSubscribersCsv();
    assert.equal(csvData.charCodeAt(0), 0xFEFF); // UTF-8 BOM
    assert.ok(csvData.includes('مشترك تموز 1'));
    assert.ok(csvData.includes('محل تجاري 50'));
    assert.ok(csvData.includes('gold'));
    assert.ok(csvData.includes('normal'));
  });
});
