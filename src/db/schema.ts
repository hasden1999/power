/**
 * src/db/schema.ts
 * Database schema definition, default seeds, and SaaS Multi-Tenant support
 */

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT DEFAULT '',
  plan TEXT DEFAULT 'trial' CHECK(plan IN ('trial','monthly','yearly')),
  plan_price REAL DEFAULT 0,
  status TEXT DEFAULT 'trial' CHECK(status IN ('active','trial','expired','blocked','pending')),
  expires_at TEXT NOT NULL,
  is_blocked INTEGER DEFAULT 0,
  license_key TEXT DEFAULT '',
  default_price REAL DEFAULT 12000,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tenants_phone ON tenants(phone);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);

CREATE TABLE IF NOT EXISTS subscribers (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  area TEXT DEFAULT '',
  neighborhood TEXT DEFAULT '',
  alley TEXT DEFAULT '',
  house_number TEXT DEFAULT '',
  amperes REAL NOT NULL DEFAULT 1.0,
  line_type TEXT NOT NULL DEFAULT 'عادي' CHECK(line_type IN ('عادي','ذهبي','ليلي','صباحي')),
  line_status TEXT NOT NULL DEFAULT 'نشط' CHECK(line_status IN ('نشط','مقطوع','معلق')),
  notes TEXT DEFAULT '',
  tenant_id TEXT DEFAULT 'tenant-default',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_subscribers_name ON subscribers(full_name);
CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(line_status);
CREATE INDEX IF NOT EXISTS idx_subscribers_phone ON subscribers(phone);
CREATE INDEX IF NOT EXISTS idx_subscribers_tenant ON subscribers(tenant_id);

CREATE TABLE IF NOT EXISTS billing (
  id TEXT PRIMARY KEY,
  subscriber_id TEXT NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  price_per_ampere REAL NOT NULL,
  total_due REAL NOT NULL,
  total_paid REAL NOT NULL DEFAULT 0,
  remaining REAL NOT NULL DEFAULT 0,
  payment_date TEXT,
  status TEXT NOT NULL DEFAULT 'غير مسدد' CHECK(status IN ('واصل','متبقي','غير مسدد')),
  notes TEXT DEFAULT '',
  tenant_id TEXT DEFAULT 'tenant-default',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(subscriber_id, month, year)
);

CREATE INDEX IF NOT EXISTS idx_billing_cycle ON billing(year, month);
CREATE INDEX IF NOT EXISTS idx_billing_subscriber ON billing(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_billing_status ON billing(status);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  expense_type TEXT NOT NULL CHECK(expense_type IN ('وقود','زيت_وفلاتر','صيانة','أجور','إيجار','نثريات')),
  fuel_liters REAL DEFAULT NULL,
  total_amount REAL NOT NULL,
  expense_date TEXT NOT NULL DEFAULT (date('now')),
  notes TEXT DEFAULT '',
  tenant_id TEXT DEFAULT 'tenant-default',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_type ON expenses(expense_type);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS backup_log (
  id TEXT PRIMARY KEY,
  backup_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  size_bytes INTEGER DEFAULT 0
);
`;

export const DEFAULT_SETTINGS: Record<string, string> = {
  generator_name: 'مولدة حي السلام الأهلية',
  owner_phone: '07700000000',
  default_ampere_price: '12000',
  currency: 'د.ع',
  trial_start_date: new Date().toISOString(),
  license_key: '',
  db_version: '2',
  modification_count: '0',
  last_backup: '',
  last_external_export: '',
  active_tenant_id: 'tenant-default',
};

export const SAMPLE_TENANTS = [
  {
    id: 'tenant-default',
    name: 'مولدة حي السلام الأهلية',
    owner_name: 'أبو أحمد البغدادي',
    phone: '07700000000',
    address: 'بغداد - حي السلام',
    plan: 'trial',
    plan_price: 0,
    status: 'trial',
    expires_at: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString(),
    is_blocked: 0,
    license_key: '',
    default_price: 12000,
  },
  {
    id: 'tenant-baghdad-01',
    name: 'مولدة القدس الأهلية',
    owner_name: 'أبو كرار المنصوري',
    phone: '07701234567',
    address: 'بغداد - المنصور - محلة 605',
    plan: 'monthly',
    plan_price: 15000,
    status: 'active',
    expires_at: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString(),
    is_blocked: 0,
    license_key: '',
    default_price: 12000,
  },
  {
    id: 'tenant-basra-02',
    name: 'مولدة النور والبركة',
    owner_name: 'أبو سجاد البصري',
    phone: '07801234567',
    address: 'البصرة - العشار - شارع الكويت',
    plan: 'yearly',
    plan_price: 150000,
    status: 'active',
    expires_at: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
    is_blocked: 0,
    license_key: '',
    default_price: 14000,
  },
  {
    id: 'tenant-najaf-03',
    name: 'مولدة الرافدين المركزية',
    owner_name: 'أبو مرتضى النجفي',
    phone: '07719876543',
    address: 'النجف الأشرف - الكوفة - قرب الميثم',
    plan: 'trial',
    plan_price: 0,
    status: 'expired',
    expires_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    is_blocked: 0,
    license_key: '',
    default_price: 11000,
  },
];

export const SAMPLE_SUBSCRIBERS = [
  {
    id: 'sub-sample-1',
    full_name: 'حيدر جاسم الموسوي',
    phone: '07712345678',
    area: 'بغداد - المنصور',
    neighborhood: '605',
    alley: '12',
    house_number: '8',
    amperes: 5.0,
    line_type: 'عادي',
    line_status: 'نشط',
    notes: 'خط رئيسي - منزل',
    tenant_id: 'tenant-default',
  },
  {
    id: 'sub-sample-2',
    full_name: 'أحمد سعدون العبيدي',
    phone: '07802345679',
    area: 'بغداد - المنصور',
    neighborhood: '605',
    alley: '5',
    house_number: '14',
    amperes: 7.0,
    line_type: 'ذهبي',
    line_status: 'نشط',
    notes: 'محل تجاري',
    tenant_id: 'tenant-default',
  },
  {
    id: 'sub-sample-3',
    full_name: 'د. علي حسين الخفاجي',
    phone: '07503456780',
    area: 'بغداد - المنصور',
    neighborhood: '605',
    alley: '12',
    house_number: '20',
    amperes: 10.0,
    line_type: 'ذهبي',
    line_status: 'نشط',
    notes: 'عيادة خاصة',
    tenant_id: 'tenant-default',
  },
];
