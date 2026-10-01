/**
 * src/license/license.ts
 * 100% Offline Cryptographic Licensing and 30-Day Free Trial Manager
 * Uses Native WebCrypto (ECDSA P-256 + SHA-256) — Zero external CDN or network dependencies
 */

import type { LicenseStatus, AppSettings } from '../types/index.ts';

// Public verification key embedded into build
export const PUBLIC_KEY_JWK: JsonWebKey = {
  kty: 'EC',
  x: 'xg2gn02kP0Oh3SXRKG4F02D8_W8Q_GY2MfiO_6j_rck',
  y: 'ruVHb0NSJGfbc5QgfE3_JurIECy22Hfic5ZOWjGlceM',
  crv: 'P-256',
};

// Private signing key for SaaS Super Admin Dashboard
export const PRIVATE_KEY_JWK: JsonWebKey = {
  kty: 'EC',
  x: 'xg2gn02kP0Oh3SXRKG4F02D8_W8Q_GY2MfiO_6j_rck',
  y: 'ruVHb0NSJGfbc5QgfE3_JurIECy22Hfic5ZOWjGlceM',
  crv: 'P-256',
  d: 'ClRTKHy_Xr9HEdAnh1HUTCfk9oG4TuCC4ewcDhrwPMQ',
};

export interface DecodedLicensePayload {
  generatorName: string;
  ownerPhone: string;
  issuedAt: string;
  expiresAt: string | null;
  licenseType: string;
  system: string;
  version: string;
}

export class LicenseManager {
  private cryptoKey: CryptoKey | null = null;
  private readonly TRIAL_DAYS = 30;

  constructor() {}

  private async getPublicKey(): Promise<CryptoKey> {
    if (!this.cryptoKey) {
      this.cryptoKey = await window.crypto.subtle.importKey(
        'jwk',
        PUBLIC_KEY_JWK,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
      );
    }
    return this.cryptoKey;
  }

  /**
   * Decode base64url string to byte array
   */
  private base64UrlToBytes(base64url: string): Uint8Array {
    let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Helper to encode byte array to base64url
   */
  private bytesToBase64Url(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /**
   * Issue a signed offline license for a generator (Used by SaaS Super Admin)
   */
  public async issueLicense(
    generatorName: string,
    ownerPhone: string,
    validDays: number = 365,
    licenseType: string = 'yearly'
  ): Promise<string> {
    const privKey = await window.crypto.subtle.importKey(
      'jwk',
      PRIVATE_KEY_JWK,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign']
    );

    const now = new Date();
    const expiresAt = validDays > 0 ? new Date(now.getTime() + validDays * 24 * 60 * 60 * 1000).toISOString() : null;

    const payload: DecodedLicensePayload = {
      generatorName: generatorName || 'المولدة الأهلية',
      ownerPhone: ownerPhone || '',
      issuedAt: now.toISOString(),
      expiresAt,
      licenseType,
      system: 'ampereji',
      version: '1.0',
    };

    const payloadJson = JSON.stringify(payload);
    const payloadBytes = new TextEncoder().encode(payloadJson);
    const payloadB64 = this.bytesToBase64Url(payloadBytes);

    const dataToSign = new TextEncoder().encode(payloadB64);
    const sigBuffer = await window.crypto.subtle.sign(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      privKey,
      dataToSign
    );

    const sigB64 = this.bytesToBase64Url(new Uint8Array(sigBuffer));
    return `AMPEREJI-${payloadB64}.${sigB64}`;
  }

  /**
   * Verify an offline license string
   */
  public async verifyLicense(licenseString: string): Promise<{
    isValid: boolean;
    payload: DecodedLicensePayload | null;
    error?: string;
  }> {
    if (!licenseString || !licenseString.startsWith('AMPEREJI-')) {
      return { isValid: false, payload: null, error: 'صيغة كود الترخيص غير صحيحة' };
    }

    try {
      const firstDash = licenseString.indexOf('-');
      const rest = licenseString.slice(firstDash + 1);
      const dotIdx = rest.lastIndexOf('.');
      if (dotIdx === -1) {
        return { isValid: false, payload: null, error: 'تنسيق التوقيع الرقمي غير صالح' };
      }

      const payloadB64 = rest.slice(0, dotIdx);
      const sigB64 = rest.slice(dotIdx + 1);

      const pubKey = await this.getPublicKey();
      const sigBytes = this.base64UrlToBytes(sigB64);
      const dataBytes = new TextEncoder().encode(payloadB64);

      const isSigValid = await window.crypto.subtle.verify(
        { name: 'ECDSA', hash: { name: 'SHA-256' } },
        pubKey,
        sigBytes as any,
        dataBytes
      );

      if (!isSigValid) {
        return { isValid: false, payload: null, error: 'فشل التحقق من التوقيع الرقمي للرخصة (كود مزوّر أو غير مطابق)' };
      }

      const jsonStr = new TextDecoder().decode(this.base64UrlToBytes(payloadB64));
      const payload: DecodedLicensePayload = JSON.parse(jsonStr);

      // Check expiration date if any
      if (payload.expiresAt) {
        const expiresTime = new Date(payload.expiresAt).getTime();
        if (Date.now() > expiresTime) {
          return { isValid: false, payload, error: 'انتهت صلاحية كود الترخيص هذا' };
        }
      }

      return { isValid: true, payload };
    } catch (err: any) {
      return { isValid: false, payload: null, error: err.message || 'خطأ أثناء فحص الترخيص' };
    }
  }

  /**
   * Evaluate full license status against current app settings
   */
  public async getStatus(settings: AppSettings): Promise<LicenseStatus> {
    // 1. Check if a license key is entered and valid
    if (settings.licenseKey && settings.licenseKey.trim()) {
      const result = await this.verifyLicense(settings.licenseKey.trim());
      if (result.isValid && result.payload) {
        return {
          isLicensed: true,
          isTrial: false,
          trialDaysRemaining: 0,
          canAddRecords: true,
          licenseExpiryDate: result.payload.expiresAt,
          licenseOwner: result.payload.ownerPhone,
          generatorName: result.payload.generatorName,
        };
      }
    }

    // 2. Otherwise calculate 30-Day Free Trial
    let trialStart = new Date(settings.trialStartDate).getTime();
    if (isNaN(trialStart) || trialStart <= 0) {
      trialStart = Date.now();
    }

    const elapsedMs = Date.now() - trialStart;
    const elapsedDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
    const remainingDays = Math.max(0, this.TRIAL_DAYS - elapsedDays);

    const isTrialActive = remainingDays > 0;

    return {
      isLicensed: false,
      isTrial: true,
      trialDaysRemaining: remainingDays,
      canAddRecords: isTrialActive, // If trial expired, only additions are locked
      licenseExpiryDate: new Date(trialStart + this.TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      licenseOwner: null,
      generatorName: settings.generatorName,
    };
  }
}

export const licenseManager = new LicenseManager();
