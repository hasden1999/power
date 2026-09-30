import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbBridge, formatIQD } from '../harness/dbDriver.ts';

describe('Tier 3: Cross-Feature Combinations - Thermal Receipt & CSV Export Pairwise', () => {

  it('PW-TE-1: payment recorded produces thermal receipt and CSV export with matching Arabic and financial totals', async () => {
    const db = new MemoryDbBridge();

    const sub = await db.addSubscriber({
      fullName: 'مصطفى علي السعدي',
      phone: '07802345678',
      street: 'بغداد - حي الجامعة - م 629 ز 14',
      breakerNumber: 'R-02',
      amperes: 10,
      subscriptionType: 'gold',
      openingBalance: 12000,
      notes: 'صيدلية اليرموك',
      isActive: true
    });

    // 10A * 18,000 + 12,000 debt = 192,000 IQD
    await db.generateMonthlyCycle(7, 2026, 12000, 18000, 8000);
    const invoice = Array.from(db.invoices.values())[0];
    assert.equal(invoice.totalDue, 192000);

    // Pay 150,000 IQD
    const { receiptNumber, remainingDebt } = await db.recordPayment(sub.id, invoice.id, 150000, 'دفعة نقدية بيد الجابي');
    assert.equal(remainingDebt, 42000);

    // 1. Thermal Receipt verification
    const thermal80 = db.generateThermalReceipt(1, '80mm');
    assert.ok(thermal80.includes(receiptNumber));
    assert.ok(thermal80.includes('مصطفى علي السعدي'));
    assert.ok(thermal80.includes('150,000 د.ع'));
    assert.ok(thermal80.includes('42,000 د.ع'));

    // 2. CSV Export verification
    const csv = db.exportSubscribersCsv();
    assert.equal(csv.charCodeAt(0), 0xFEFF); // UTF-8 BOM
    assert.ok(csv.includes('مصطفى علي السعدي'));
    assert.ok(csv.includes('07802345678'));
    assert.ok(csv.includes('R-02'));
    assert.ok(csv.includes('10'));
    assert.ok(csv.includes('gold'));
  });

  it('PW-TE-2: receipt and CSV representations handle Arabic quotation marks and commas without escaping corruption', async () => {
    const db = new MemoryDbBridge();
    await db.addSubscriber({
      fullName: 'كرار "أبو حيدر"',
      phone: '07701112222',
      street: 'المنصور, شارع 14 رمضان, قرب جامع دراغ',
      breakerNumber: 'S-01',
      amperes: 5,
      subscriptionType: 'normal',
      openingBalance: 0,
      isActive: true
    });

    const csv = db.exportSubscribersCsv();
    assert.ok(csv.includes('""أبو حيدر""'));
    assert.ok(csv.includes('"المنصور, شارع 14 رمضان, قرب جامع دراغ"'));
  });
});
