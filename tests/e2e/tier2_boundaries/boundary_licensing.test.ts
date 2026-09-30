import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { OfflineLicenseEngine, MonotonicTrialClock, type LicensePayload } from '../harness/cryptoHelper.ts';

describe('Tier 2: Boundary & Corner Cases - Licensing & Anti-Tamper Clock', () => {
  let engine: OfflineLicenseEngine;

  before(async () => {
    engine = new OfflineLicenseEngine();
    await engine.initialize();
  });

  it('B-LC-1: detects single bit flip in cryptographic signature segment', async () => {
    const payload: LicensePayload = {
      generatorName: 'مولدة حي الجامعة',
      phone: '07701234567',
      capacityAmperes: 500,
      issuedAt: Date.now(),
      expiresAt: 0,
      features: ['all']
    };

    const token = await engine.signLicense(payload);
    const parts = token.split('.');
    const sigBytes = Buffer.from(parts[2], 'base64url');

    // Flip lowest bit of first byte
    sigBytes[0] ^= 0x01;
    parts[2] = Buffer.from(sigBytes).toString('base64url');
    const tamperedToken = parts.join('.');

    const result = await engine.verifyLicense(tamperedToken, Date.now());
    assert.equal(result.isValid, false);
    assert.equal(result.reason, 'invalid_signature');
  });

  it('B-LC-2: handles exact expiration timestamp millisecond boundaries', async () => {
    const targetExpiry = 1774900000000;
    const payload: LicensePayload = {
      generatorName: 'مولدة الكرادة',
      phone: '07801234567',
      capacityAmperes: 300,
      issuedAt: 1774800000000,
      expiresAt: targetExpiry,
      features: ['all']
    };

    const token = await engine.signLicense(payload);

    // 1 ms before expiry: valid
    const beforeResult = await engine.verifyLicense(token, targetExpiry - 1);
    assert.equal(beforeResult.isValid, true);

    // Exactly at expiry: valid
    const atResult = await engine.verifyLicense(token, targetExpiry);
    assert.equal(atResult.isValid, true);

    // 1 ms after expiry: invalid (expired)
    const afterResult = await engine.verifyLicense(token, targetExpiry + 1);
    assert.equal(afterResult.isValid, false);
    assert.equal(afterResult.reason, 'expired');
  });

  it('B-LC-3: detects tiny 1-millisecond clock rewind in monotonic clock', () => {
    const baseTime = 1774900000000;
    const clock = new MonotonicTrialClock(baseTime);

    clock.getEffectiveTime(baseTime + 100);
    // Rewind by only 1 millisecond
    clock.getEffectiveTime(baseTime + 99);

    assert.equal(clock.isTamperDetected(), true);
  });

  it('B-LC-4: handles extreme 100-year future clock jump', () => {
    const baseTime = 1774900000000;
    const clock = new MonotonicTrialClock(baseTime);

    const hundredYearsMs = 100 * 365 * 24 * 60 * 60 * 1000;
    const futureTime = baseTime + hundredYearsMs;

    assert.equal(clock.isTrialExpired(futureTime), true);
    assert.equal(clock.getDaysRemaining(futureTime), 0);
  });

  it('B-LC-5: handles token with non-ASCII or invalid base64 characters', async () => {
    const weirdTokens = [
      'AMP1.باي_لود.توقيع',
      'AMP1.!!!.???',
      'AMP1...empty..segments',
      ''
    ];

    for (const t of weirdTokens) {
      const res = await engine.verifyLicense(t, Date.now());
      assert.equal(res.isValid, false);
    }
  });

  it('B-LC-6: handles lifetime license with expiresAt = 0 indefinitely', async () => {
    const payload: LicensePayload = {
      generatorName: 'مولدة المنصور الأهلية',
      phone: '07709876543',
      capacityAmperes: 1000,
      issuedAt: 1774800000000,
      expiresAt: 0, // Lifetime
      features: ['all']
    };

    const token = await engine.signLicense(payload);

    // Check 50 years into the future
    const distantFuture = Date.now() + (50 * 365 * 24 * 60 * 60 * 1000);
    const result = await engine.verifyLicense(token, distantFuture);
    assert.equal(result.isValid, true);
  });
});
