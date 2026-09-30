import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbBridge } from '../harness/dbDriver.ts';

describe('Tier 3: Cross-Feature Combinations - Subscribers & Billing Pairwise', () => {
  let db: MemoryDbBridge;

  beforeEach(() => {
    db = new MemoryDbBridge();
  });

  it('PW-SB-1: deactivating a subscriber prevents new invoice generation while preserving debt history', async () => {
    // 1. Add subscriber with 5 Amperes
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

    // 2. Issue Month 7 cycle: 5 * 12,000 = 60,000
    await db.generateMonthlyCycle(7, 2026, 12000, 18000, 8000);
    const inv1 = Array.from(db.invoices.values())[0];
    assert.equal(inv1.totalDue, 60000);

    // Subscriber pays only 20,000 IQD -> 40,000 remaining debt
    await db.recordPayment(sub.id, inv1.id, 20000);
    assert.equal(inv1.totalDue - inv1.totalPaid, 40000);

    // 3. Subscriber moves away or line is disconnected -> set isActive: false
    await db.updateSubscriber(sub.id, { isActive: false });

    // 4. Issue Month 8 cycle: inactive subscriber must NOT receive new currentAmount
    const { invoicesGenerated } = await db.generateMonthlyCycle(8, 2026, 12000, 18000, 8000);
    assert.equal(invoicesGenerated, 0, 'No invoices should be generated for inactive subscribers');

    // 5. Debt history remains intact and accessible
    const unpaidInvoices = Array.from(db.invoices.values()).filter((i) => i.subscriberId === sub.id && i.status !== 'paid');
    assert.equal(unpaidInvoices.length, 1);
    assert.equal(unpaidInvoices[0].totalDue - unpaidInvoices[0].totalPaid, 40000);
  });

  it('PW-SB-2: adding subscriber mid-month includes them in subsequent cycles but not prior closed cycles', async () => {
    // Month 7 cycle with Sub 1
    await db.addSubscriber({ fullName: 'مشترك 1', phone: '1', street: 's', breakerNumber: 'b1', amperes: 5, subscriptionType: 'normal', openingBalance: 0, isActive: true });
    await db.generateMonthlyCycle(7, 2026, 12000, 18000, 8000);
    assert.equal(db.invoices.size, 1);

    // Sub 2 joins mid-month
    const sub2 = await db.addSubscriber({ fullName: 'مشترك 2 (جديد)', phone: '2', street: 's', breakerNumber: 'b2', amperes: 4, subscriptionType: 'gold', openingBalance: 0, isActive: true });

    // Month 8 cycle includes BOTH
    await db.generateMonthlyCycle(8, 2026, 12000, 18000, 8000);
    assert.equal(db.invoices.size, 3); // 1 in month 7 + 2 in month 8

    const sub2Invoices = Array.from(db.invoices.values()).filter((i) => i.subscriberId === sub2.id);
    assert.equal(sub2Invoices.length, 1);
    assert.equal(sub2Invoices[0].month, 8);
    assert.equal(sub2Invoices[0].currentAmount, 4 * 18000); // 72,000 IQD
  });

  it('PW-SB-3: changing amperage mid-cycle affects future cycles only without altering existing invoices', async () => {
    const sub = await db.addSubscriber({ fullName: 'سجاد عادل', phone: '07700000000', street: 's', breakerNumber: 'b1', amperes: 5, subscriptionType: 'normal', openingBalance: 0, isActive: true });

    // Month 7: 5 Amperes * 12,000 = 60,000
    await db.generateMonthlyCycle(7, 2026, 12000, 18000, 8000);
    const inv7 = Array.from(db.invoices.values())[0];
    assert.equal(inv7.currentAmount, 60000);

    // Upgrade to 10 Amperes
    await db.updateSubscriber(sub.id, { amperes: 10 });

    // Existing month 7 invoice is immutable
    assert.equal(inv7.currentAmount, 60000);
    assert.equal(inv7.amperes, 5);

    // Month 8: uses new 10 Amperes * 12,000 = 120,000 + 60,000 carried debt = 180,000
    await db.generateMonthlyCycle(8, 2026, 12000, 18000, 8000);
    const inv8 = Array.from(db.invoices.values()).find((i) => i.month === 8)!;
    assert.equal(inv8.amperes, 10);
    assert.equal(inv8.currentAmount, 120000);
    assert.equal(inv8.previousDebt, 60000);
    assert.equal(inv8.totalDue, 180000);
  });
});
