import Dexie, { type Table } from 'dexie';
import { supabase } from '../services/supabaseClient';
import { hashPassword, isPasswordHashed } from '../services/authSecurity';
import type { Subscriber, BillingCycle, Invoice, Payment, TenantSettings, UserAccount, Expense } from '../types';

export interface SyncQueueItem {
  id: string;
  action: 'insert' | 'update' | 'delete';
  entity: 'subscribers' | 'payments' | 'invoices' | 'cycles' | 'expenses';
  entityId: string;
  payload: any;
  createdAt: string;
  attempts: number;
}

export class GeneratorDatabase extends Dexie {
  users!: Table<UserAccount, string>;
  subscribers!: Table<Subscriber, string>;
  billingCycles!: Table<BillingCycle, string>;
  invoices!: Table<Invoice, string>;
  payments!: Table<Payment, string>;
  settings!: Table<TenantSettings, string>;
  syncQueue!: Table<SyncQueueItem, string>;
  expenses!: Table<Expense, string>;

  constructor() {
    super('AlMowalladaDB');

    this.version(3).stores({
      users: 'id, username, role, tenantId',
      subscribers: 'id, tenantId, fullName, phone, street, breakerNumber, isActive, subscriptionType',
      billingCycles: 'id, tenantId, [month+year], isClosed',
      invoices: 'id, tenantId, cycleId, subscriberId, status, [subscriberId+cycleId]',
      payments: 'id, tenantId, subscriberId, invoiceId, syncStatus, paymentDate',
      settings: 'id, subscriptionStatus, isBlocked',
      syncQueue: 'id, entity, entityId, createdAt',
      expenses: 'id, tenantId, category, date, createdAt'
    });
  }
}

export const db = new GeneratorDatabase();

// دالة تهيئة بيانات منصة الـ SaaS متعددة المستأجرين مع حساب صاحب المنصة
export async function seedInitialData() {
  const adminRawPass = 'Qaqaqa12@12';
  const existingAdmin = await db.users.get('user-super-admin');
  let adminHashedPass = existingAdmin?.password;
  if (!adminHashedPass || !isPasswordHashed(adminHashedPass)) {
    adminHashedPass = await hashPassword(adminRawPass);
  }

  // 1. حساب صاحب المنصة (Super Admin) بتسجيل الدخول الجديد المحمي بهاش التشفير
  const superAdminUser: UserAccount = {
    id: 'user-super-admin',
    username: 'power',
    password: adminHashedPass,
    fullName: 'صاحب المنصة',
    role: 'super_admin',
    createdAt: new Date().toISOString(),
  };

  // التأكد دائماً من وجود حساب السوبر أدمن الجديد وحذف القديم
  await db.users.put(superAdminUser);
  await db.users.where('username').equals('admin').delete();

  // تحويل أي مولدة محلية معلقة تلقائياً إلى فترة تجريبية 7 أيام
  try {
    const pendingSettings = await db.settings.where('subscriptionStatus').equals('pending_activation').toArray();
    for (const s of pendingSettings) {
      const trialExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      await db.settings.update(s.id, {
        subscriptionStatus: 'trial',
        plan: 'trial',
        expiresAt: trialExpiresAt,
      });
    }
  } catch {
    // تجاهل أي خطأ
  }

  if (navigator.onLine) {
    try {
      await supabase.from('users').upsert({
        id: 'user-super-admin',
        username: 'power',
        password: adminHashedPass,
        full_name: 'صاحب المنصة',
        role: 'super_admin',
        tenant_id: null,
      });
      await supabase.from('users').delete().eq('username', 'admin');
    } catch {
      // تجاهل أي خطأ عابر
    }
  }

  const usersCount = await db.users.count();
  if (usersCount > 1) return;

  // 2. مستأجري المولدات (المولدات المشتركة في المنظومة في العراق)
  const tenants: TenantSettings[] = [
    {
      id: 'tenant-baghdad-01',
      generatorName: 'مولدة القدس الأهلية',
      ownerName: 'أبو كرار المنصوري',
      phone: '07701234567',
      address: 'بغداد - المنصور - محلة 605',
      plan: 'monthly',
      planPrice: 15000,
      subscriptionStatus: 'active',
      isBlocked: false,
      expiresAt: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString(),
      autoSendWhatsapp: true,
      defaultPriceNormal: 12000,
      defaultPriceGold: 20000,
      createdAt: '2026-01-10T10:00:00.000Z',
    },
    {
      id: 'tenant-basra-02',
      generatorName: 'مولدة النور والبركة',
      ownerName: 'أبو سجاد البصري',
      phone: '07801234567',
      address: 'البصرة - العشار - شارع الكويت',
      plan: 'yearly',
      planPrice: 150000,
      subscriptionStatus: 'active',
      isBlocked: false,
      expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
      autoSendWhatsapp: true,
      defaultPriceNormal: 14000,
      defaultPriceGold: 22000,
      createdAt: '2026-02-01T12:00:00.000Z',
    },
    {
      id: 'tenant-najaf-03',
      generatorName: 'مولدة الرافدين المركزية',
      ownerName: 'أبو مرتضى النجفي',
      phone: '07719876543',
      address: 'النجف الأشرف - الكوفة - قرب الميثم',
      plan: 'trial',
      planPrice: 0,
      subscriptionStatus: 'grace_period',
      isBlocked: false,
      expiresAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // منتهية وتحتاج تجديد
      autoSendWhatsapp: true,
      defaultPriceNormal: 11000,
      defaultPriceGold: 19000,
      createdAt: '2026-08-15T09:00:00.000Z',
    }
  ];

  await db.settings.bulkPut(tenants);

  // حسابات أصحاب المولدات لتسجيل الدخول (محمية بهاش التشفير)
  const defaultOwnerHashedPass = await hashPassword('123456');
  const generatorUsers: UserAccount[] = [
    superAdminUser,
    {
      id: 'user-baghdad',
      username: '07701234567',
      password: defaultOwnerHashedPass,
      fullName: 'أبو كرار المنصوري (بغداد)',
      role: 'tenant_owner',
      tenantId: 'tenant-baghdad-01',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'user-basra',
      username: '07801234567',
      password: defaultOwnerHashedPass,
      fullName: 'أبو سجاد البصري (البصرة)',
      role: 'tenant_owner',
      tenantId: 'tenant-basra-02',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'user-najaf',
      username: '07719876543',
      password: defaultOwnerHashedPass,
      fullName: 'أبو مرتضى النجفي (النجف)',
      role: 'tenant_owner',
      tenantId: 'tenant-najaf-03',
      createdAt: new Date().toISOString(),
    }
  ];

  await db.users.bulkPut(generatorUsers);

  // 3. عينات المشتركين (موزعين بين المولدات)
  const sampleSubscribers: Subscriber[] = [
    // مولدة بغداد
    {
      id: 'sub-1',
      tenantId: 'tenant-baghdad-01',
      fullName: 'حيدر جاسم الموسوي',
      phone: '07712345678',
      street: 'شارع المنصور الرئيسي / فرع 12',
      breakerNumber: 'B-101',
      amperes: 5,
      subscriptionType: 'normal',
      openingBalance: 0,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'sub-2',
      tenantId: 'tenant-baghdad-01',
      fullName: 'أحمد سعدون العبيدي',
      phone: '07802345679',
      street: 'شارع 14 رمضان / زقاق 5',
      breakerNumber: 'B-102',
      amperes: 7,
      subscriptionType: 'gold',
      openingBalance: 15000,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'sub-3',
      tenantId: 'tenant-baghdad-01',
      fullName: 'د. علي حسين الخفاجي',
      phone: '07503456780',
      street: 'شارع المنصور الرئيسي / فرع 12',
      breakerNumber: 'B-103',
      amperes: 10,
      subscriptionType: 'gold',
      openingBalance: 0,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    // مولدة البصرة
    {
      id: 'sub-basra-1',
      tenantId: 'tenant-basra-02',
      fullName: 'قاسم محمد السعدون',
      phone: '07788991122',
      street: 'شارع الوطن / فرع النهر',
      breakerNumber: 'BAS-01',
      amperes: 6,
      subscriptionType: 'gold',
      openingBalance: 0,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'sub-basra-2',
      tenantId: 'tenant-basra-02',
      fullName: 'صباح كريم التميمي',
      phone: '07899002233',
      street: 'منطقة الجمهورية / زقاق 9',
      breakerNumber: 'BAS-02',
      amperes: 4,
      subscriptionType: 'normal',
      openingBalance: 20000,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    // مولدة النجف
    {
      id: 'sub-najaf-1',
      tenantId: 'tenant-najaf-03',
      fullName: 'سيد جواد الغريفي',
      phone: '07722114455',
      street: 'شارع الكوفة العام / زقاق 1',
      breakerNumber: 'NJF-01',
      amperes: 5,
      subscriptionType: 'normal',
      openingBalance: 0,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  ];

  await db.subscribers.bulkPut(sampleSubscribers);

  // 4. دورات الفوترة والفواتير
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const cycleBaghdad: BillingCycle = {
    id: `cycle-baghdad-${currentYear}-${currentMonth}`,
    tenantId: 'tenant-baghdad-01',
    month: currentMonth,
    year: currentYear,
    pricePerAmpereNormal: 12000,
    pricePerAmpereGold: 20000,
    pricePerAmpereNight: 8000,
    issueDate: new Date().toISOString(),
    isClosed: false,
    notes: `تسعيرة بغداد - شهر ${currentMonth}`,
    createdAt: new Date().toISOString(),
  };

  const cycleBasra: BillingCycle = {
    id: `cycle-basra-${currentYear}-${currentMonth}`,
    tenantId: 'tenant-basra-02',
    month: currentMonth,
    year: currentYear,
    pricePerAmpereNormal: 14000,
    pricePerAmpereGold: 22000,
    pricePerAmpereNight: 9000,
    issueDate: new Date().toISOString(),
    isClosed: false,
    notes: `تسعيرة البصرة - شهر ${currentMonth}`,
    createdAt: new Date().toISOString(),
  };

  await db.billingCycles.bulkPut([cycleBaghdad, cycleBasra]);

  const invoices: Invoice[] = [
    {
      id: 'inv-1',
      tenantId: 'tenant-baghdad-01',
      cycleId: cycleBaghdad.id,
      subscriberId: 'sub-1',
      month: currentMonth,
      year: currentYear,
      amperes: 5,
      unitPrice: 12000,
      currentAmount: 60000,
      previousDebt: 0,
      discount: 0,
      totalDue: 60000,
      totalPaid: 60000,
      status: 'paid',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'inv-2',
      tenantId: 'tenant-baghdad-01',
      cycleId: cycleBaghdad.id,
      subscriberId: 'sub-2',
      month: currentMonth,
      year: currentYear,
      amperes: 7,
      unitPrice: 20000,
      currentAmount: 140000,
      previousDebt: 15000,
      discount: 0,
      totalDue: 155000,
      totalPaid: 50000,
      status: 'partial',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'inv-3',
      tenantId: 'tenant-baghdad-01',
      cycleId: cycleBaghdad.id,
      subscriberId: 'sub-3',
      month: currentMonth,
      year: currentYear,
      amperes: 10,
      unitPrice: 20000,
      currentAmount: 200000,
      previousDebt: 0,
      discount: 0,
      totalDue: 200000,
      totalPaid: 0,
      status: 'unpaid',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'inv-basra-1',
      tenantId: 'tenant-basra-02',
      cycleId: cycleBasra.id,
      subscriberId: 'sub-basra-1',
      month: currentMonth,
      year: currentYear,
      amperes: 6,
      unitPrice: 22000,
      currentAmount: 132000,
      previousDebt: 0,
      discount: 0,
      totalDue: 132000,
      totalPaid: 132000,
      status: 'paid',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  ];

  await db.invoices.bulkPut(invoices);

  const payments: Payment[] = [
    {
      id: 'pay-1',
      tenantId: 'tenant-baghdad-01',
      invoiceId: 'inv-1',
      subscriberId: 'sub-1',
      amount: 60000,
      paymentDate: new Date().toISOString(),
      collectorName: 'أبو كرار (المدير)',
      notes: 'تم التسديد نقداً كامل المبلغ',
      syncStatus: 'synced',
      receiptNumber: 'REC-1001',
    },
    {
      id: 'pay-2',
      tenantId: 'tenant-baghdad-01',
      invoiceId: 'inv-2',
      subscriberId: 'sub-2',
      amount: 50000,
      paymentDate: new Date().toISOString(),
      collectorName: 'أبو كرار (المدير)',
      notes: 'دفعة أولى',
      syncStatus: 'synced',
      receiptNumber: 'REC-1002',
    }
  ];

  await db.payments.bulkPut(payments);
}
