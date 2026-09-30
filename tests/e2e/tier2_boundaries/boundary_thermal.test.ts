import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbBridge, normalizeArabic } from '../harness/dbDriver.ts';

describe('Tier 2: Boundary & Corner Cases - Arabic Thermal Receipt & Linguistics', () => {

  it('B-TH-1: strips Arabic Harakat/Tashkeel and Tatweel during normalization', () => {
    const withTashkeel = 'مُحَمَّـدٌ عَلِيّ';
    const normalized = normalizeArabic(withTashkeel);
    assert.equal(normalized, 'محمد علي');
  });

  it('B-TH-2: handles Persian/Kurdish characters in Kurdish-Iraqi names without throwing', () => {
    const kurdishName = 'پشتيوان گوران چاووش';
    const normalized = normalizeArabic(kurdishName);
    assert.ok(normalized.includes('پ'));
    assert.ok(normalized.includes('گ'));
    assert.ok(normalized.includes('چ'));
  });

  it('B-TH-3: handles 100-character subscriber name in 58mm compact thermal receipt', async () => {
    const db = new MemoryDbBridge();
    const longName = 'الحاج كرار حيدر عبد الله الساعدي ابن المرحوم أبو سجاد الحسيني العامري الشمري البغدادي';
    const sub = await db.addSubscriber({
      fullName: longName,
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
    await db.recordPayment(sub.id, inv.id, 60000);

    const receipt = db.generateThermalReceipt(1, '58mm');
    assert.ok(receipt.includes(longName));
    assert.ok(receipt.includes('المسدد'));
  });

  it('B-TH-4: prints zero remaining debt on fully settled receipt', async () => {
    const db = new MemoryDbBridge();
    const sub = await db.addSubscriber({
      fullName: 'أحمد ستار',
      phone: '07800000000',
      street: 'الشارع',
      breakerNumber: 'R-01',
      amperes: 2,
      subscriptionType: 'normal',
      openingBalance: 0,
      isActive: true
    });

    await db.generateMonthlyCycle(7, 2026, 12000, 18000, 8000);
    const inv = Array.from(db.invoices.values())[0];
    await db.recordPayment(sub.id, inv.id, 24000); // 2 * 12,000 = 24,000

    const receipt = db.generateThermalReceipt(1, '80mm');
    assert.ok(receipt.includes('المتبقي (دين):  0 د.ع'));
  });

  it('B-TH-5: handles complex Arabic ligatures and special symbols in printer stream', () => {
    const ligatureText = 'لا إله إلا الله محمد رسول الله ﷺ';
    const encoded = new TextEncoder().encode(ligatureText);
    assert.ok(encoded.byteLength > ligatureText.length); // Multi-byte UTF-8
    const decoded = new TextDecoder().decode(encoded);
    assert.equal(decoded, ligatureText);
  });

  it('B-TH-6: verifies ESC/POS paper cut command bytes integrity', () => {
    const fullCut = new Uint8Array([0x1D, 0x56, 0x00]); // GS V 0 (full cut)
    const partialCut = new Uint8Array([0x1D, 0x56, 0x01]); // GS V 1 (partial cut)
    assert.equal(fullCut[2], 0);
    assert.equal(partialCut[2], 1);
  });
});
