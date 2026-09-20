// أنواع البيانات الأساسية لنظام إدارة المولدات الأهلية (Multi-Tenant SaaS)

export type UserRole = 'super_admin' | 'tenant_owner' | 'collector';

export interface UserAccount {
  id: string;
  username: string; // اسم المستخدم أو رقم الهاتف
  password: string; // كلمة المرور
  fullName: string;
  role: UserRole;
  tenantId?: string; // معرف المولدة التي يتبع لها (غير موجود لصاحب المنصة)
  createdAt: string;
}

export type SubscriptionType = 'normal' | 'gold' | 'night' | 'fixed';

export interface Subscriber {
  id: string; // UUID
  tenantId: string;
  fullName: string;
  phone: string;
  street: string; // الزقاق أو الشارع
  breakerNumber: string; // رقم القاطع / الصندوق / الفيز
  amperes: number; // عدد الأمبيرات (مثال: 3.5، 5)
  subscriptionType: SubscriptionType; // عادي، ذهبي، مسائي، مقطوعة
  fixedPrice?: number; // في حال كان مقطوع
  openingBalance: number; // ديون سابقة مرحلة عند بداية التسجيل
  isActive: boolean;
  notes?: string;
  version?: number; // رقم الإصدار لتتبع التعديلات وحل التعارضات
  isDeleted?: boolean; // الحذف الناعم (Soft Delete)
  createdAt: string;
  updatedAt: string;
}

export interface BillingCycle {
  id: string; // UUID
  tenantId: string;
  month: number; // 1-12
  year: number; // 2026 مثلاً
  pricePerAmpereNormal: number; // سعر الأمبير العادي (بالدينار العراقي)
  pricePerAmpereGold: number; // سعر الأمبير الذهبي (بالدينار العراقي)
  pricePerAmpereNight: number; // سعر الأمبير المسائي
  issueDate: string;
  notes?: string;
  isClosed: boolean;
  version?: number;
  isDeleted?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface Invoice {
  id: string; // UUID
  tenantId: string;
  cycleId: string;
  subscriberId: string;
  month: number;
  year: number;
  amperes: number;
  unitPrice: number;
  currentAmount: number; // amperes * unitPrice
  previousDebt: number; // ديون الأشهر السابقة المتبقية
  discount: number; // تخفيض خاص إن وجد
  totalDue: number; // currentAmount + previousDebt - discount
  totalPaid: number; // المبالغ المسددة فعلياً
  status: 'unpaid' | 'partial' | 'paid';
  version?: number;
  isDeleted?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string; // UUID
  tenantId: string;
  invoiceId?: string;
  subscriberId: string;
  amount: number; // المبلغ المدفوع بالدينار العراقي
  paymentDate: string;
  collectorName: string; // اسم الجابي / صاحب المولدة
  notes?: string;
  syncStatus: 'pending' | 'synced'; // للمزامنة الأوفلاين
  receiptNumber: string; // رقم السند الورقي أو المتسلسل
  version?: number;
  isDeleted?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface TenantSettings {
  id: string;
  generatorName: string; // اسم المولدة، مثلاً "مولدة حي السلام الأهلية"
  ownerName: string; // اسم صاحب المولدة
  phone: string;
  address: string; // المدينة والمحافظة
  plan: 'trial' | 'monthly' | 'yearly';
  planPrice: number; // سعر الاشتراك بالدينار العراقي (مثلاً 15,000 د.ع أو 150,000 د.ع)
  subscriptionStatus: 'active' | 'trial' | 'expired' | 'grace_period' | 'pending_activation';
  isBlocked: boolean; // حظر من قبل صاحب المنصة
  expiresAt: string;
  autoSendWhatsapp: boolean;
  defaultPriceNormal: number;
  defaultPriceGold: number;
  version?: number;
  isDeleted?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export type ExpenseCategory = 'fuel' | 'oil_maintenance' | 'repairs' | 'salaries' | 'rent' | 'other';

export interface Expense {
  id: string; // UUID
  tenantId: string;
  category: ExpenseCategory;
  title: string; // مثلاً: شراء كاز صهريج، تبديل دهن 20W50، تصليح دينمو، راتب الجابي
  amount: number; // المبلغ بالدينار العراقي
  liters?: number; // كمية لترات الكاز في حال كان وقود
  date: string; // YYYY-MM-DD
  notes?: string;
  createdByName: string; // اسم مسجل المصروف
  version?: number;
  isDeleted?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export type AuditAction = 
  | 'create' 
  | 'update' 
  | 'delete' 
  | 'payment_recorded' 
  | 'payment_updated'
  | 'payment_deleted'
  | 'price_changed' 
  | 'debt_adjusted' 
  | 'login' 
  | 'logout';

export type AuditEntityType = 
  | 'subscriber' 
  | 'invoice' 
  | 'payment' 
  | 'billing_cycle' 
  | 'expense' 
  | 'tenant_settings' 
  | 'auth';

export interface AuditLog {
  id: string; // UUID
  tenantId: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  details?: Record<string, any>;
  createdAt: string;
}

export type LedgerAccount = 'subscriber_receivable' | 'cash_box' | 'revenue' | 'expense';
export type LedgerTransactionType = 'invoice_issued' | 'payment_received' | 'debt_adjustment' | 'expense_paid';

export interface LedgerEntry {
  id: string; // UUID
  tenantId: string;
  transactionType: LedgerTransactionType;
  referenceId: string; // invoiceId, paymentId, expenseId
  subscriberId?: string;
  account: LedgerAccount;
  debit: number; // مدين
  credit: number; // دائن
  description: string;
  createdAt: string;
}

