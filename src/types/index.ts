/**
 * src/types/index.ts
 * Core domain types and interfaces for Ampereji (أمبيرجي)
 * Offline-first PWA for private generator management in Iraq
 */

export type LineType = 'عادي' | 'ذهبي' | 'ليلي' | 'صباحي';
export type LineStatus = 'نشط' | 'مقطوع' | 'معلق';
export type BillStatus = 'واصل' | 'متبقي' | 'غير مسدد';
export type ExpenseType = 'وقود' | 'زيت_وفلاتر' | 'صيانة' | 'أجور' | 'إيجار' | 'نثريات';

export interface Subscriber {
  id: string;
  fullName: string;
  phone: string;
  area: string;
  neighborhood: string;
  alley: string;
  houseNumber: string;
  amperes: number;
  lineType: LineType;
  lineStatus: LineStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface BillingRecord {
  id: string;
  subscriberId: string;
  subscriberName?: string;
  phone?: string;
  amperes?: number;
  month: number;
  year: number;
  pricePerAmpere: number;
  totalDue: number;
  totalPaid: number;
  remaining: number;
  paymentDate: string | null;
  status: BillStatus;
  notes: string;
  createdAt: string;
}

export interface Expense {
  id: string;
  expenseType: ExpenseType;
  fuelLiters: number | null;
  totalAmount: number;
  expenseDate: string;
  notes: string;
  createdAt: string;
}

export interface AppSettings {
  generatorName: string;
  ownerPhone: string;
  defaultAmperePrice: number;
  currency: string;
  trialStartDate: string;
  licenseKey: string;
  dbVersion: string;
  modificationCount: number;
  lastBackup: string;
  lastExternalExport: string;
}

export interface LicenseStatus {
  isLicensed: boolean;
  isTrial: boolean;
  trialDaysRemaining: number;
  canAddRecords: boolean;
  licenseExpiryDate: string | null;
  licenseOwner: string | null;
  generatorName: string;
}

export interface MonthlyReport {
  month: number;
  year: number;
  totalSubscribers: number;
  activeSubscribers: number;
  totalAmperes: number;
  totalDue: number;
  totalCollected: number;
  totalDebt: number;
  totalExpenses: number;
  fuelExpenses: number;
  fuelLiters: number;
  netProfit: number;
}

export interface BackupMetadata {
  id: string;
  backupType: 'auto_opfs' | 'manual_export';
  createdAt: string;
  sizeBytes: number;
}
