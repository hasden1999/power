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

CREATE TABLE IF NOT EXISTS auth_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'tenant_owner' CHECK(role IN ('super_admin','tenant_owner')),
  tenant_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_login TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

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

/**
 * Indexes are separated from table creation so old databases can receive the
 * new tenant_id columns before the indexes that depend on them are created.
 */
export const INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS idx_tenants_phone ON tenants(phone);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_auth_users_role ON auth_users(role);
CREATE INDEX IF NOT EXISTS idx_auth_users_tenant ON auth_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscribers_name ON subscribers(full_name);
CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(line_status);
CREATE INDEX IF NOT EXISTS idx_subscribers_phone ON subscribers(phone);
CREATE INDEX IF NOT EXISTS idx_subscribers_tenant ON subscribers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_billing_cycle ON billing(year, month);
CREATE INDEX IF NOT EXISTS idx_billing_subscriber ON billing(subscriber_id);
CREATE INDEX IF NOT EXISTS idx_billing_status ON billing(status);
CREATE INDEX IF NOT EXISTS idx_billing_tenant ON billing(tenant_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_type ON expenses(expense_type);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant ON expenses(tenant_id);
`;

export const DEFAULT_SETTINGS: Record<string, string> = {
  generator_name: 'مولدتي الأهلية',
  owner_phone: '',
  default_ampere_price: '12000',
  currency: 'د.ع',
  trial_start_date: new Date().toISOString(),
  license_key: '',
  db_version: '3',
  modification_count: '0',
  last_backup: '',
  last_external_export: '',
  active_tenant_id: 'tenant-default',
};

/**
 * A brand-new installation starts with one local generator workspace only.
 * Demo/fake tenants and subscribers are intentionally NOT seeded in production.
 */
export const DEFAULT_TENANT = {
  id: 'tenant-default',
  name: 'مولدتي الأهلية',
  owner_name: 'صاحب المولدة',
  phone: '',
  address: '',
  plan: 'trial',
  plan_price: 0,
  status: 'trial',
  expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  is_blocked: 0,
  license_key: '',
  default_price: 12000,
};
