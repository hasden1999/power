/**
 * src/db/schema.ts
 * Database schema definition, default seeds, and migrations for SQLite WASM
 */

export const SCHEMA_SQL = `
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
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_subscribers_name ON subscribers(full_name);
CREATE INDEX IF NOT EXISTS idx_subscribers_status ON subscribers(line_status);
CREATE INDEX IF NOT EXISTS idx_subscribers_phone ON subscribers(phone);

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
  db_version: '1',
  modification_count: '0',
  last_backup: '',
  last_external_export: '',
};

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
  },
];
