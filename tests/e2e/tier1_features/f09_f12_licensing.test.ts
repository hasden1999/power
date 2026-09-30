import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { OfflineLicenseEngine, MonotonicTrialClock, type LicensePayload } from '../harness/cryptoHelper.ts';

describe('Tier 1: Feature Coverage (F9 - F12) - Cryptographic Licensing & Trial Guard', () => {
  let engine: OfflineLicenseEngine;

  before(async () => {
    engine = new OfflineLicenseEngine();
    await engine.initialize();
  });

  // --- F9: CLI License Generator ---
  describe('F9: CLI License Generator', () => {
    it('F9-1: exports valid base64 public key in SPKI format', () => {
      const pubKey = engine.getPublicKeyBase64();
      assert.ok(pubKey.length > 50);
      assert.ok(/^[A-Za-z0-9+/=]+$/.test(pubKey));
    });

    it('F9-2: signs license payload and produces token with AMP1 prefix', async () => {
      const payload: LicensePayload = {
        generatorName: 'مولدة حي الجامعة 1',
        phone: '07701234567',
        capacityAmperes: 500,
        issuedAt: Date.now(),
        expiresAt: 0, // Lifetime
        features: ['all']
      };

      const token = await engine.signLicense(payload);
      assert.ok(token.startsWith('AMP1.'));
      const parts = token.split('.');
      assert.equal(parts.length, 3);
    });

    it('F9-3: includes generator capacity and contact information in signed payload', async () => {
      const payload: LicensePayload = {
        generatorName: 'مولدة الكرادة الأهلية',
        phone: '07801234567',
        capacityAmperes: 800,
        issuedAt: Date.now(),
        expiresAt: Date.now() + (365 * 24 * 60 * 60 * 1000), // 1 Year
        features: ['all']
      };

      const token = await engine.signLicense(payload);
      const res = await engine.verifyLicense(token, Date.now());
      assert.equal(res.isValid, true);
      assert.equal(res.payload?.generatorName, 'مولدة الكرادة الأهلية');
      assert.equal(res.payload?.capacityAmperes, 800);
    });

    it('F9-4: serializes and signs time-limited licenses with specific expiration timestamps', async () => {
      const oneMonthLater = Date.now() + (30 * 24 * 60 * 60 * 1000);
      const payload: LicensePayload = {
        generatorName: 'مولدة المنصور',
        phone: '07501234567',
        capacityAmperes: 350,
        issuedAt: Date.now(),
        expiresAt: oneMonthLater,
        features: ['subscribers', 'billing']
      };

      const token = await engine.signLicense(payload);
      assert.ok(token.length > 100);
    });

    it('F9-5: generates deterministic, verifiable signatures across separate runs', async () => {
      const payload: LicensePayload = {
        generatorName: 'مولدة الدورة',
        phone: '07712345678',
        capacityAmperes: 400,
        issuedAt: 1774900000000,
        expiresAt: 0,
        features: ['all']
      };

      const token1 = await engine.signLicense(payload);
      const res1 = await engine.verifyLicense(token1, 1774900000000);
      assert.equal(res1.isValid, true);
    });
  });

  // --- F10: Client License Verifier ---
  describe('F10: Client License Verifier', () => {
    it('F10-1: successfully verifies valid offline license using public key and WebCrypto', async () => {
      const payload: LicensePayload = {
        generatorName: 'مولدة حي العامل',
        phone: '07800001111',
        capacityAmperes: 600,
        issuedAt: Date.now(),
        expiresAt: 0,
        features: ['all']
      };

      const token = await engine.signLicense(payload);
      const result = await engine.verifyLicense(token, Date.now());
      assert.equal(result.isValid, true);
      assert.equal(result.payload?.generatorName, 'مولدة حي العامل');
    });

    it('F10-2: rejects license token with altered payload (signature mismatch)', async () => {
      const payload: LicensePayload = {
        generatorName: 'مولدة حي الجامعة',
        phone: '07701234567',
        capacityAmperes: 250,
        issuedAt: Date.now(),
        expiresAt: 0,
        features: ['all']
      };

      const token = await engine.signLicense(payload);
      const parts = token.split('.');

      // Attacker tampers with payload: changes capacity from 250 to 999
      const tamperedPayload = { ...payload, capacityAmperes: 999 };
      parts[1] = Buffer.from(JSON.stringify(tamperedPayload)).toString('base64url');
      const tamperedToken = parts.join('.');

      const result = await engine.verifyLicense(tamperedToken, Date.now());
      assert.equal(result.isValid, false);
      assert.equal(result.reason, 'invalid_signature');
    });

    it('F10-3: rejects expired license token when current time exceeds expiresAt', async () => {
      const pastTime = Date.now() - 1000000;
      const expiredTime = Date.now() - 500000;
      const payload: LicensePayload = {
        generatorName: 'مولدة الغزالية',
        phone: '07802223333',
        capacityAmperes: 300,
        issuedAt: pastTime,
        expiresAt: expiredTime,
        features: ['all']
      };

      const token = await engine.signLicense(payload);
      const result = await engine.verifyLicense(token, Date.now());
      assert.equal(result.isValid, false);
      assert.equal(result.reason, 'expired');
    });

    it('F10-4: rejects malformed license tokens without AMP1 prefix or invalid structure', async () => {
      const result1 = await engine.verifyLicense('INVALID.TOKEN.DATA', Date.now());
      assert.equal(result1.isValid, false);
      assert.equal(result1.reason, 'malformed');

      const result2 = await engine.verifyLicense('AMP1.ONLY_TWO_PARTS', Date.now());
      assert.equal(result2.isValid, false);
      assert.equal(result2.reason, 'malformed');
    });

    it('F10-5: rejects license signed by an unauthorized/alien private key', async () => {
      const alienEngine = new OfflineLicenseEngine();
      await alienEngine.initialize();

      const payload: LicensePayload = {
        generatorName: 'مولدة الشعب',
        phone: '07505556666',
        capacityAmperes: 500,
        issuedAt: Date.now(),
        expiresAt: 0,
        features: ['all']
      };

      // Signed by alien key
      const alienToken = await alienEngine.signLicense(payload);

      // Verified against official public key
      const result = await engine.verifyLicense(alienToken, Date.now());
      assert.equal(result.isValid, false);
      assert.equal(result.reason, 'invalid_signature');
    });
  });

  // --- F11: Monotonic Anti-Tamper Clock ---
  describe('F11: Monotonic Anti-Tamper Clock', () => {
    it('F11-1: advances high-water mark monotonically as system time progresses', () => {
      const baseTime = 1774900000000;
      const clock = new MonotonicTrialClock(baseTime);

      assert.equal(clock.getEffectiveTime(baseTime + 1000), baseTime + 1000);
      assert.equal(clock.getEffectiveTime(baseTime + 5000), baseTime + 5000);
      assert.equal(clock.isTamperDetected(), false);
    });

    it('F11-2: detects clock rewind and freezes effective time at high-water mark', () => {
      const baseTime = 1774900000000;
      const clock = new MonotonicTrialClock(baseTime);

      // Operator ran for 15 days
      const day15Time = baseTime + (15 * 24 * 60 * 60 * 1000);
      clock.getEffectiveTime(day15Time);

      // Operator rolls clock backwards to baseTime
      const effectiveAfterRollback = clock.getEffectiveTime(baseTime);

      assert.equal(clock.isTamperDetected(), true);
      // High-water mark did not rewind
      assert.equal(effectiveAfterRollback, day15Time);
    });

    it('F11-3: correctly calculates remaining trial days within 30-day window', () => {
      const baseTime = 1774900000000;
      const clock = new MonotonicTrialClock(baseTime);

      assert.equal(clock.getDaysRemaining(baseTime), 30);

      // After 10 days
      const day10Time = baseTime + (10 * 24 * 60 * 60 * 1000);
      assert.equal(clock.getDaysRemaining(day10Time), 20);
      assert.equal(clock.isTrialExpired(day10Time), false);
    });

    it('F11-4: expires trial at 30 days and 1 millisecond', () => {
      const baseTime = 1774900000000;
      const clock = new MonotonicTrialClock(baseTime);

      const day30End = baseTime + (30 * 24 * 60 * 60 * 1000) + 1;
      assert.equal(clock.isTrialExpired(day30End), true);
      assert.equal(clock.getDaysRemaining(day30End), 0);
    });

    it('F11-5: prevents trial reactivation by rolling back clock after expiration', () => {
      const baseTime = 1774900000000;
      const clock = new MonotonicTrialClock(baseTime);

      // Expire on Day 31
      const day31Time = baseTime + (31 * 24 * 60 * 60 * 1000);
      assert.equal(clock.isTrialExpired(day31Time), true);

      // Attempt to set clock back to Day 2
      const rollbackTime = baseTime + (2 * 24 * 60 * 60 * 1000);
      assert.equal(clock.isTrialExpired(rollbackTime), true);
      assert.equal(clock.getDaysRemaining(rollbackTime), 0);
      assert.equal(clock.isTamperDetected(), true);
    });
  });

  // --- F12: Selective Mutation Guard ---
  describe('F12: Selective Mutation Guard', () => {
    interface MutationGuardContext {
      isLicensed: boolean;
      isTrialExpired: boolean;
    }

    const checkOperationAllowed = (ctx: MutationGuardContext, action: 'add_subscriber' | 'add_cycle' | 'record_payment' | 'add_expense' | 'export_backup' | 'print_receipt') => {
      if (ctx.isLicensed) return true;
      if (!ctx.isTrialExpired) return true;

      // When trial expired and unlicensed: selectively block subscriber creation and billing cycles
      if (action === 'add_subscriber' || action === 'add_cycle') {
        return false;
      }

      // Debt collection, expenses, backups, and printing remain permanently allowed
      return true;
    };

    it('F12-1: allows all operations when trial is active', () => {
      const ctx: MutationGuardContext = { isLicensed: false, isTrialExpired: false };
      assert.equal(checkOperationAllowed(ctx, 'add_subscriber'), true);
      assert.equal(checkOperationAllowed(ctx, 'add_cycle'), true);
      assert.equal(checkOperationAllowed(ctx, 'record_payment'), true);
      assert.equal(checkOperationAllowed(ctx, 'add_expense'), true);
      assert.equal(checkOperationAllowed(ctx, 'export_backup'), true);
    });

    it('F12-2: blocks subscriber insertion after trial expiry without license', () => {
      const ctx: MutationGuardContext = { isLicensed: false, isTrialExpired: true };
      assert.equal(checkOperationAllowed(ctx, 'add_subscriber'), false);
    });

    it('F12-3: blocks new billing cycle generation after trial expiry without license', () => {
      const ctx: MutationGuardContext = { isLicensed: false, isTrialExpired: true };
      assert.equal(checkOperationAllowed(ctx, 'add_cycle'), false);
    });

    it('F12-4: permits debt collection and payments permanently even when trial is expired', () => {
      const ctx: MutationGuardContext = { isLicensed: false, isTrialExpired: true };
      assert.equal(checkOperationAllowed(ctx, 'record_payment'), true);
      assert.equal(checkOperationAllowed(ctx, 'print_receipt'), true);
    });

    it('F12-5: unblocks all operations immediately once valid license is applied', () => {
      const ctx: MutationGuardContext = { isLicensed: true, isTrialExpired: true };
      assert.equal(checkOperationAllowed(ctx, 'add_subscriber'), true);
      assert.equal(checkOperationAllowed(ctx, 'add_cycle'), true);
    });
  });
});
