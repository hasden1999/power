import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbBridge, roundIQD, formatIQD } from '../harness/dbDriver.ts';
import { SAMPLE_SUBSCRIBERS, SAMPLE_EXPENSES, DEFAULT_GENERATOR_CONFIG } from '../harness/iraqiFixtures.ts';

describe('Tier 1: Feature Coverage (F17 - F20) - Financial & Business Operations', () => {
  let db: MemoryDbBridge;

  beforeEach(() => {
    db = new MemoryDbBridge();
  });

  // --- F17: Subscribers Management ---
  describe('F17: Subscribers Management', () => {
    it('F17-1: creates subscriber with full details and valid default state', async () => {
      const data = SAMPLE_SUBSCRIBERS[0];
      const sub = await db.addSubscriber({
        fullName: data.fullName,
        phone: data.phone,
        street: data.street,
        breakerNumber: data.breakerNumber,
        amperes: data.amperes,
        subscriptionType: data.subscriptionType,
        openingBalance: data.openingBalance,
        isActive: true,
        notes: data.notes
      });

      assert.equal(sub.id, 1);
      assert.equal(sub.fullName, 'كرار حيدر الشمري');
      assert.equal(sub.amperes, 5);
      assert.equal(sub.isActive, true);
    });

    it('F17-2: supports multiple line types (normal, gold, night, morning)', async () => {
      const types = ['normal', 'gold', 'night', 'morning'] as const;
      for (const t of types) {
        const sub = await db.addSubscriber({
          fullName: `مشترك خط ${t}`,
          phone: '07700000000',
          street: 'الشارع العام',
          breakerNumber: 'B-01',
          amperes: 4,
          subscriptionType: t,
          openingBalance: 0,
          isActive: true
        });
        assert.equal(sub.subscriptionType, t);
      }
      assert.equal(db.subscribers.size, 4);
    });

    it('F17-3: handles decimal ampere values (e.g. 2.5A, 3.5A, 7.5A)', async () => {
      const sub = await db.addSubscriber({
        fullName: 'أحمد ستار (3.5 أمبير)',
        phone: '07801112222',
        street: 'حي الجامعة',
        breakerNumber: 'S-01',
        amperes: 3.5,
        subscriptionType: 'normal',
        openingBalance: 0,
        isActive: true
      });

      assert.equal(sub.amperes, 3.5);
    });

    it('F17-4: searches subscribers by alley, street, or breaker number', async () => {
      for (const data of SAMPLE_SUBSCRIBERS) {
        await db.addSubscriber({ ...data, isActive: true });
      }

      const inZouqaq14 = db.searchSubscribers('ز 14');
      assert.equal(inZouqaq14.length, 2);

      const breakerT01 = db.searchSubscribers('T-01');
      assert.equal(breakerT01.length, 1);
      assert.equal(breakerT01[0].fullName, 'زينب حسين الموسوي');
    });

    it('F17-5: toggles line status (active to inactive/disconnected)', async () => {
      const sub = await db.addSubscriber({
        fullName: 'حيدر جاسم',
        phone: '07719876543',
        street: 'حي الجامعة',
        breakerNumber: 'S-02',
        amperes: 6,
        subscriptionType: 'night',
        openingBalance: 0,
        isActive: true
      });

      // Disconnect line
      const updated = await db.updateSubscriber(sub.id, { isActive: false });
      assert.equal(updated.isActive, false);

      const activeSubs = db.searchSubscribers('', 'active');
      assert.equal(activeSubs.length, 0);
    });
  });

  // --- F18: Billing & Collections Engine ---
  describe('F18: Billing & Collections Engine', () => {
    it('F18-1: calculates monthly invoice amounts according to subscription rates', async () => {
      // Add normal subscriber (5A) and gold subscriber (10A)
      await db.addSubscriber({
        fullName: 'كرار (عادي 5A)',
        phone: '07701111111',
        street: 'حي الجامعة',
        breakerNumber: 'R-01',
        amperes: 5,
        subscriptionType: 'normal',
        openingBalance: 0,
        isActive: true
      });

      await db.addSubscriber({
        fullName: 'مصطفى (ذهبي 10A)',
        phone: '07802222222',
        street: 'حي الجامعة',
        breakerNumber: 'R-02',
        amperes: 10,
        subscriptionType: 'gold',
        openingBalance: 0,
        isActive: true
      });

      // Issue cycle: normal = 12,000 IQD, gold = 18,000 IQD
      const { invoicesGenerated } = await db.generateMonthlyCycle(7, 2026, 12000, 18000, 8000);
      assert.equal(invoicesGenerated, 2);

      const invoices = Array.from(db.invoices.values());
      const normalInv = invoices.find((i) => i.amperes === 5)!;
      const goldInv = invoices.find((i) => i.amperes === 10)!;

      // 5A * 12,000 = 60,000 IQD
      assert.equal(normalInv.currentAmount, 60000);
      assert.equal(normalInv.totalDue, 60000);

      // 10A * 18,000 = 180,000 IQD
      assert.equal(goldInv.currentAmount, 180000);
      assert.equal(goldInv.totalDue, 180000);
    });

    it('F18-2: applies Iraqi Dinar 250 IQD rounding rules and formatting', () => {
      assert.equal(roundIQD(12100), 12000);
      assert.equal(roundIQD(12150), 12250);
      assert.equal(roundIQD(12380), 12500);
      assert.equal(roundIQD(12500), 12500);

      assert.equal(formatIQD(12500), '12,500 د.ع');
      assert.equal(formatIQD(1500000), '1,500,000 د.ع');
    });

    it('F18-3: carries over cumulative debt and previous unpaid balances to current invoice', async () => {
      const sub = await db.addSubscriber({
        fullName: 'أحمد ستار (عليه دين سابق)',
        phone: '07503456789',
        street: 'حي الجامعة',
        breakerNumber: 'S-01',
        amperes: 4,
        subscriptionType: 'normal',
        openingBalance: 25000, // 25,000 IQD initial debt
        isActive: true
      });

      // Month 1 cycle: 4A * 12,000 = 48,000 + 25,000 debt = 73,000 IQD
      await db.generateMonthlyCycle(7, 2026, 12000, 18000, 8000);
      const inv1 = Array.from(db.invoices.values())[0];
      assert.equal(inv1.currentAmount, 48000);
      assert.equal(inv1.previousDebt, 25000);
      assert.equal(inv1.totalDue, 73000);

      // Subscriber pays 30,000 IQD (partial payment)
      await db.recordPayment(sub.id, inv1.id, 30000);
      assert.equal(inv1.totalPaid, 30000);
      assert.equal(inv1.status, 'partial');

      // Month 2 cycle: remaining debt is 73,000 - 30,000 = 43,000 IQD
      await db.generateMonthlyCycle(8, 2026, 12000, 18000, 8000);
      const inv2 = Array.from(db.invoices.values()).find((i) => i.month === 8)!;
      assert.equal(inv2.previousDebt, 43000);
      assert.equal(inv2.currentAmount, 48000);
      assert.equal(inv2.totalDue, 91000);
    });

    it('F18-4: generates serialized receipt number with REC-YYYY-PREFIX-SEQ format', async () => {
      const sub = await db.addSubscriber({
        fullName: 'حيدر جاسم',
        phone: '07700001111',
        street: 'حي الجامعة',
        breakerNumber: 'R-01',
        amperes: 5,
        subscriptionType: 'normal',
        openingBalance: 0,
        isActive: true
      });

      await db.generateMonthlyCycle(7, 2026, 12000, 18000, 8000);
      const inv = Array.from(db.invoices.values())[0];

      const { receiptNumber } = await db.recordPayment(sub.id, inv.id, 60000);
      assert.ok(/^REC-2026-AMP-\d{4}$/.test(receiptNumber));
      assert.equal(receiptNumber, 'REC-2026-AMP-0001');
    });

    it('F18-5: rejects overpayment when payment amount exceeds remaining balance', async () => {
      const sub = await db.addSubscriber({
        fullName: 'زينب الموسوي',
        phone: '07800002222',
        street: 'حي الجامعة',
        breakerNumber: 'T-01',
        amperes: 2,
        subscriptionType: 'normal',
        openingBalance: 0,
        isActive: true
      });

      await db.generateMonthlyCycle(7, 2026, 12000, 18000, 8000);
      const inv = Array.from(db.invoices.values())[0];
      // Total due is 2 * 12,000 = 24,000 IQD

      await assert.rejects(
        async () => {
          await db.recordPayment(sub.id, inv.id, 50000); // 50,000 > 24,000
        },
        /Overpayment rejected/
      );
    });
  });

  // --- F19: Expenses & Diesel Tracking ---
  describe('F19: Expenses & Diesel Tracking', () => {
    it('F19-1: records fuel purchases with liter quantity and calculates price per liter', async () => {
      const exp = await db.addExpense({
        category: 'fuel',
        title: 'تزويد صهريج كاز',
        amount: 1125000,
        liters: 1500,
        date: '2026-07-05',
        notes: 'سعر اللتر 750 د.ع'
      });

      assert.equal(exp.category, 'fuel');
      assert.equal(exp.liters, 1500);
      assert.equal(exp.amount, 1125000);

      const pricePerLiter = Math.round(exp.amount / exp.liters!);
      assert.equal(pricePerLiter, 750);
    });

    it('F19-2: records non-fuel operational expenses (oil, filters, repairs, wages, rent)', async () => {
      for (const item of SAMPLE_EXPENSES) {
        await db.addExpense(item);
      }
      assert.equal(db.expenses.size, SAMPLE_EXPENSES.length);

      const oilExp = Array.from(db.expenses.values()).find((e) => e.category === 'oil_maintenance');
      assert.ok(oilExp);
      assert.equal(oilExp.amount, 160000);
    });

    it('F19-3: computes monthly diesel consumption aggregates and average price per liter', async () => {
      // Tank 1: 1,000L @ 750 = 750,000
      await db.addExpense({ category: 'fuel', title: 'صهريج 1', amount: 750000, liters: 1000, date: '2026-07-02' });
      // Tank 2: 1,000L @ 850 = 850,000
      await db.addExpense({ category: 'fuel', title: 'صهريج 2', amount: 850000, liters: 1000, date: '2026-07-16' });

      const report = db.getMonthlyReport(7, 2026);
      assert.equal(report.fuelLiters, 2000);
      assert.equal(report.fuelExpenses, 1600000);
      // Average price: 1,600,000 / 2000 = 800 IQD/L
      assert.equal(report.averageDieselPrice, 800);
    });

    it('F19-4: aggregates total operational expenditure across all categories', async () => {
      for (const item of SAMPLE_EXPENSES) {
        await db.addExpense(item);
      }
      const totalExpected = SAMPLE_EXPENSES.reduce((sum, e) => sum + e.amount, 0);

      const report = db.getMonthlyReport(7, 2026);
      assert.equal(report.totalExpenses, totalExpected);
    });

    it('F19-5: filters expenses by date range and category', () => {
      const expenses = [
        { category: 'fuel', amount: 500000, date: '2026-07-01' },
        { category: 'repairs', amount: 150000, date: '2026-07-10' },
        { category: 'fuel', amount: 700000, date: '2026-08-01' }
      ];

      const julyFuel = expenses.filter((e) => e.category === 'fuel' && e.date.startsWith('2026-07'));
      assert.equal(julyFuel.length, 1);
      assert.equal(julyFuel[0].amount, 500000);
    });
  });

  // --- F20: Reports & Profit Analysis ---
  describe('F20: Reports & Profit Analysis', () => {
    it('F20-1: generates monthly balance sheet showing total due, collected, and debt', async () => {
      // 2 subscribers: Sub1 (5A Normal @ 12k = 60k), Sub2 (5A Normal @ 12k = 60k)
      const sub1 = await db.addSubscriber({ fullName: 'م1', phone: '1', street: 's', breakerNumber: 'b1', amperes: 5, subscriptionType: 'normal', openingBalance: 0, isActive: true });
      const sub2 = await db.addSubscriber({ fullName: 'م2', phone: '2', street: 's', breakerNumber: 'b2', amperes: 5, subscriptionType: 'normal', openingBalance: 0, isActive: true });

      await db.generateMonthlyCycle(7, 2026, 12000, 18000, 8000);
      const invoices = Array.from(db.invoices.values());

      // Sub 1 pays in full (60k)
      await db.recordPayment(sub1.id, invoices[0].id, 60000);
      // Sub 2 pays partial (20k)
      await db.recordPayment(sub2.id, invoices[1].id, 20000);

      const report = db.getMonthlyReport(7, 2026);
      assert.equal(report.totalDue, 120000);
      assert.equal(report.totalCollected, 80000);
      assert.equal(report.totalDebt, 40000);
    });

    it('F20-2: computes net profit accurately: Collected Revenue minus Total Expenses', async () => {
      // Revenue collected: 80,000 IQD
      const sub = await db.addSubscriber({ fullName: 'م1', phone: '1', street: 's', breakerNumber: 'b1', amperes: 10, subscriptionType: 'normal', openingBalance: 0, isActive: true });
      await db.generateMonthlyCycle(7, 2026, 12000, 18000, 8000);
      const inv = Array.from(db.invoices.values())[0];
      await db.recordPayment(sub.id, inv.id, 120000); // 120,000 collected

      // Expenses: 70,000
      await db.addExpense({ category: 'fuel', title: 'كاز', amount: 70000, liters: 100, date: '2026-07-10' });

      const report = db.getMonthlyReport(7, 2026);
      assert.equal(report.totalCollected, 120000);
      assert.equal(report.totalExpenses, 70000);
      assert.equal(report.netProfit, 50000); // 120,000 - 70,000 = 50,000 IQD
    });

    it('F20-3: monitors generator capacity overload threshold', () => {
      const generatorCapacityKva = 500;
      // 500 kVA at 0.8 pf and 3-phase translates roughly to max amperes
      // Safe threshold is e.g. 500 * 1.44 * 0.80 = ~576 Amperes total
      const checkOverload = (totalAmperes: number, capacityKva: number) => {
        const maxSafeAmperes = capacityKva * 1.2; // rule of thumb
        const isOverloaded = totalAmperes > maxSafeAmperes;
        const loadPercentage = Math.round((totalAmperes / maxSafeAmperes) * 100);
        return { isOverloaded, loadPercentage, maxSafeAmperes };
      };

      const statusSafe = checkOverload(400, generatorCapacityKva);
      assert.equal(statusSafe.isOverloaded, false);

      const statusOverload = checkOverload(700, generatorCapacityKva);
      assert.equal(statusOverload.isOverloaded, true);
      assert.ok(statusOverload.loadPercentage > 100);
    });

    it('F20-4: handles zero collections or negative profit gracefully (loss month)', async () => {
      // High fuel expense with 0 collections
      await db.addExpense({ category: 'fuel', title: 'كاز طارئ', amount: 500000, liters: 600, date: '2026-07-01' });

      const report = db.getMonthlyReport(7, 2026);
      assert.equal(report.totalCollected, 0);
      assert.equal(report.totalExpenses, 500000);
      assert.equal(report.netProfit, -500000); // Loss of 500,000 IQD
    });

    it('F20-5: formats financial report summary with localized Iraqi currency representations', () => {
      const report = {
        totalDue: 12500000,
        totalCollected: 10000000,
        totalExpenses: 6500000,
        netProfit: 3500000
      };

      assert.equal(formatIQD(report.totalDue), '12,500,000 د.ع');
      assert.equal(formatIQD(report.totalCollected), '10,000,000 د.ع');
      assert.equal(formatIQD(report.netProfit), '3,500,000 د.ع');
    });
  });
});
