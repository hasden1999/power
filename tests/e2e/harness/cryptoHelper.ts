/**
 * Cryptographic Helper for Offline Licensing Engine
 * Uses WebCrypto (crypto.subtle) conforming to PROJECT.md interface contract
 */

export interface LicensePayload {
  generatorName: string;
  phone: string;
  capacityAmperes: number;
  issuedAt: number;     // Unix timestamp (ms)
  expiresAt: number;    // Unix timestamp (ms) or 0 for lifetime
  features: string[];   // ['all'] or specific feature flags
}

export interface LicenseValidationResult {
  isValid: boolean;
  payload?: LicensePayload;
  reason?: 'invalid_signature' | 'expired' | 'malformed' | 'tampered';
}

export class OfflineLicenseEngine {
  private keyPair!: CryptoKeyPair;
  private rawPublicKeyBase64!: string;

  async initialize(): Promise<void> {
    // Generate ECDSA P-256 keypair for native browser/Node WebCrypto compatibility
    this.keyPair = await crypto.subtle.generateKey(
      {
        name: 'ECDSA',
        namedCurve: 'P-256'
      },
      true,
      ['sign', 'verify']
    );

    const exported = await crypto.subtle.exportKey('spki', this.keyPair.publicKey);
    this.rawPublicKeyBase64 = Buffer.from(exported).toString('base64');
  }

  getPublicKeyBase64(): string {
    return this.rawPublicKeyBase64;
  }

  async signLicense(payload: LicensePayload): Promise<string> {
    const jsonStr = JSON.stringify(payload);
    const payloadBase64 = Buffer.from(jsonStr, 'utf-8').toString('base64url');
    const dataToSign = new TextEncoder().encode(`AMP1.${payloadBase64}`);

    const signature = await crypto.subtle.sign(
      {
        name: 'ECDSA',
        hash: { name: 'SHA-256' }
      },
      this.keyPair.privateKey,
      dataToSign
    );

    const sigBase64 = Buffer.from(signature).toString('base64url');
    return `AMP1.${payloadBase64}.${sigBase64}`;
  }

  async verifyLicense(
    token: string,
    currentTimestamp: number,
    customPublicKeyBase64?: string
  ): Promise<LicenseValidationResult> {
    try {
      if (!token.startsWith('AMP1.')) {
        return { isValid: false, reason: 'malformed' };
      }

      const parts = token.split('.');
      if (parts.length !== 3) {
        return { isValid: false, reason: 'malformed' };
      }

      const [, payloadBase64, sigBase64] = parts;
      const jsonStr = Buffer.from(payloadBase64, 'base64url').toString('utf-8');
      const payload: LicensePayload = JSON.parse(jsonStr);

      // Verify expiration (0 means lifetime)
      if (payload.expiresAt !== 0 && currentTimestamp > payload.expiresAt) {
        return { isValid: false, payload, reason: 'expired' };
      }

      // Import public key
      const keyToUse = customPublicKeyBase64 || this.rawPublicKeyBase64;
      const rawKeyBuffer = Buffer.from(keyToUse, 'base64');
      const cryptoKey = await crypto.subtle.importKey(
        'spki',
        rawKeyBuffer,
        {
          name: 'ECDSA',
          namedCurve: 'P-256'
        },
        false,
        ['verify']
      );

      const dataToVerify = new TextEncoder().encode(`AMP1.${payloadBase64}`);
      const sigBuffer = Buffer.from(sigBase64, 'base64url');

      const isVerified = await crypto.subtle.verify(
        {
          name: 'ECDSA',
          hash: { name: 'SHA-256' }
        },
        cryptoKey,
        sigBuffer,
        dataToVerify
      );

      if (!isVerified) {
        return { isValid: false, reason: 'invalid_signature' };
      }

      return { isValid: true, payload };
    } catch {
      return { isValid: false, reason: 'tampered' };
    }
  }
}

/**
 * Monotonic Clock Tracker
 * Prevents system clock manipulation to bypass trial expiry
 */
export class MonotonicTrialClock {
  private readonly trialDurationMs = 30 * 24 * 60 * 60 * 1000; // 30 days
  private firstStartTime: number;
  private highWaterMark: number;
  private isTampered = false;

  constructor(initialStartTime?: number) {
    const now = initialStartTime ?? Date.now();
    this.firstStartTime = now;
    this.highWaterMark = now;
  }

  recordObservation(currentSystemTime: number): void {
    if (currentSystemTime < this.highWaterMark) {
      // Clock was turned backwards!
      this.isTampered = true;
      // High-water mark remains strictly monotonic
    } else {
      this.highWaterMark = currentSystemTime;
    }
  }

  getEffectiveTime(currentSystemTime: number): number {
    this.recordObservation(currentSystemTime);
    return this.highWaterMark;
  }

  isTrialExpired(currentSystemTime: number): boolean {
    const effectiveTime = this.getEffectiveTime(currentSystemTime);
    const elapsed = effectiveTime - this.firstStartTime;
    return elapsed > this.trialDurationMs;
  }

  getDaysRemaining(currentSystemTime: number): number {
    const effectiveTime = this.getEffectiveTime(currentSystemTime);
    const elapsed = effectiveTime - this.firstStartTime;
    const remainingMs = this.trialDurationMs - elapsed;
    if (remainingMs <= 0) return 0;
    return Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
  }

  isTamperDetected(): boolean {
    return this.isTampered;
  }
}
