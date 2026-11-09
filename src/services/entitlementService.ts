/**
 * src/services/entitlementService.ts
 * Single source of truth for "may this workspace add new records?".
 *
 * A workspace can be entitled by:
 *  1. A valid signed license code (offline ECDSA verification), or
 *  2. An active subscription recorded on its tenant by the platform owner.
 * A blocked tenant always wins over both.
 */

import { db } from '../db/database.ts';
import { licenseManager } from '../license/license.ts';
import type { LicenseStatus, Tenant } from '../types/index.ts';

export type EntitlementSource = 'license' | 'subscription' | 'trial' | 'blocked' | 'expired';

export interface Entitlement {
  status: LicenseStatus;
  tenant: Tenant | null;
  source: EntitlementSource;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function expiryDays(expiresAt: string): number {
  const time = new Date(expiresAt).getTime();
  if (!Number.isFinite(time)) return 0;
  return Math.max(0, Math.ceil((time - Date.now()) / DAY_MS));
}

export async function getEntitlement(): Promise<Entitlement> {
  const [settings, tenant] = await Promise.all([db.getSettings(), db.getCurrentTenant()]);
  const license = await licenseManager.getStatus(settings);

  if (tenant?.isBlocked) {
    return {
      tenant,
      source: 'blocked',
      status: {
        isLicensed: false,
        isTrial: false,
        trialDaysRemaining: 0,
        canAddRecords: false,
        licenseExpiryDate: tenant.expiresAt || null,
        licenseOwner: tenant.phone || null,
        generatorName: tenant.name,
      },
    };
  }

  if (license.isLicensed) {
    return { tenant, source: 'license', status: license };
  }

  if (tenant) {
    const expiresAt = new Date(tenant.expiresAt).getTime();
    const isFuture = Number.isFinite(expiresAt) && expiresAt > Date.now();
    const daysLeft = expiryDays(tenant.expiresAt);

    if (isFuture && tenant.status === 'active') {
      return {
        tenant,
        source: 'subscription',
        status: {
          isLicensed: true,
          isTrial: false,
          trialDaysRemaining: 0,
          canAddRecords: true,
          licenseExpiryDate: tenant.expiresAt,
          licenseOwner: tenant.phone || null,
          generatorName: tenant.name,
        },
      };
    }

    if (isFuture && tenant.status === 'trial') {
      return {
        tenant,
        source: 'trial',
        status: {
          isLicensed: false,
          isTrial: true,
          trialDaysRemaining: daysLeft,
          canAddRecords: true,
          licenseExpiryDate: tenant.expiresAt,
          licenseOwner: null,
          generatorName: tenant.name,
        },
      };
    }

    return {
      tenant,
      source: 'expired',
      status: {
        isLicensed: false,
        isTrial: false,
        trialDaysRemaining: 0,
        canAddRecords: false,
        licenseExpiryDate: tenant.expiresAt || null,
        licenseOwner: null,
        generatorName: tenant.name,
      },
    };
  }

  return {
    tenant: null,
    source: license.isLicensed ? 'license' : license.canAddRecords ? 'trial' : 'expired',
    status: license,
  };
}

export function entitlementLockMessage(entitlement: Entitlement): string {
  if (entitlement.source === 'blocked') {
    return 'تم إيقاف حساب هذه المولدة من قبل إدارة المنصة. يمكنك استعراض السجلات وتصديرها، لكن إضافة سجلات جديدة غير متاحة حتى يُعاد تفعيل الاشتراك.';
  }
  if (entitlement.source === 'expired') {
    return 'انتهى اشتراك هذه المولدة. يمكنك استعراض كافة السجلات وطباعة الوصولات وتصدير البيانات، لكن إضافة سجلات جديدة متوقفة حتى يتم تجديد الاشتراك أو إدخال كود ترخيص ساري.';
  }
  return 'لا تملك صلاحية إضافة سجلات جديدة في الوقت الحالي.';
}
