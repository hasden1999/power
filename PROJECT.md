# Project: Ampereji (أمبيرجي - نظام إدارة المولدات الأهلية)

## Architecture

Ampereji is a high-performance, 100% Offline-First Standalone Progressive Web Application (PWA) built with Vanilla TypeScript and Vite, engineered specifically for Iraqi private generator operators.

### Core Architectural Pillars
1. **Zero External CDN & Offline Isolation**:
   - Zero external HTTP requests. All fonts (Cairo `.woff2`), SQLite WASM binaries (`sqlite3.wasm`), icons (SVG), and styles are bundled locally.
   - Vite PWA Service Worker precaches 100% of application assets with `maximumFileSizeToCacheInBytes: 6 * 1024 * 1024`.
   - Cross-Origin Isolation (`COOP: same-origin` and `COEP: require-corp`) configured for both Vite dev server and `vercel.json` to enable `SharedArrayBuffer` for OPFS.
2. **Dedicated Web Worker Database Engine**:
   - Official SQLite WebAssembly (`@sqlite.org/sqlite-wasm`) runs exclusively inside a dedicated Web Worker (`src/db/sqlite.worker.ts`).
   - Uses `sqlite3.oo1.OpfsDb` backed by Origin Private File System (OPFS) for persistent, crash-resilient storage with `navigator.storage.persist()`.
   - Main thread communicates asynchronously with the worker via a typed Promise-based RPC bridge (`src/db/bridge.ts`).
   - Ephemeral memory database (`:memory:`) fallback automatically activated in non-standalone browser mode to prevent WebKit/Safari 7-day data eviction.
3. **Cryptographic Licensing & Monotonic Trial Guard**:
   - Node.js CLI script `tools/generate-license.js` generates Ed25519/ECDSA digital keypairs and signs offline licenses using native `crypto.subtle`.
   - Client embeds public key and verifies signed tokens (`AMP1.<payload>.<sig>`) offline with browser `SubtleCrypto`.
   - Monotonic high-water mark timestamp tracking prevents system clock manipulation.
   - Free trial lasts 30 calendar days from first initialization. Upon expiry without a valid license, write operations for new subscribers and invoices are selectively blocked; reading, searching, printing receipts, debt collection, expenses, and backups remain permanently active.
4. **Data Integrity, Rotating Backup & Safe Restore**:
   - Automated rotating OPFS backups triggered every 24 hours or 50 mutations, retaining the last 7 chronological snapshots.
   - External backup export creates `.sqlite` binary snapshots accessible via Web Share API or direct download.
   - Multi-stage safe restore: validates 16-byte SQLite magic header (`SQLite format 3\0`), executes `PRAGMA integrity_check` on an isolated temporary instance, creates an automatic pre-restore safety snapshot, and requires explicit user confirmation.
   - CSV export with UTF-8 BOM (`\uFEFF`) ensures proper Arabic display in Microsoft Excel.
5. **Pure Vanilla TypeScript Arabic RTL UI & Thermal Printing**:
   - Zero heavy framework runtime. Component-based Vanilla TS DOM rendering with responsive layouts, CSS logical properties, and `<html lang="ar" dir="rtl">`.
   - Primary color: `#0E7490` (Teal Energy) with electrical light accents, minimum 44px touch targets, mobile bottom navigation, and light/dark theme.
   - Thermal invoice engine supporting both 58mm and 80mm paper widths, Arabic letter reshaping, BiDi reordering, and monochrome 1-bit raster ESC/POS generation for direct Bluetooth printing.

---

## Feature Inventory

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | Platform Discovery | Detect standalone, iOS Safari, In-App browser, Android/Desktop in `src/platform.ts` | M1 | R1, Survey |
| F2 | Smart Install Banner | Bottom banner with 3-day snooze preference and iOS step-by-step guidance in `src/config/install-texts.ts` | M1 | R1, Survey |
| F3 | Browser Mode Protection | Block persistent storage in uninstalled browser mode, fallback to `:memory:`, show persistent warning banner | M1 | R1, Survey |
| F4 | COOP/COEP & Dev Server Security | Configure COOP/COEP headers in `vite.config.ts` and `vercel.json` to enable SharedArrayBuffer | M1 | R7, Survey |
| F5 | SQLite WASM & OPFS Worker | Run `@sqlite.org/sqlite-wasm` via Web Worker with `OpfsDb` and Promise-based RPC bridge | M2 | R2, Survey |
| F6 | DDL & Auto-Migration | SQLite schema for subscribers, pricing cycles, invoices, payments, expenses, settings, and backup logs | M2 | R2, Survey |
| F7 | Storage Persistence & Quota | Trigger `navigator.storage.persist()` and expose OPFS quota tracking in settings | M2 | R2, Survey |
| F8 | SQLite Repository Layer | Pure TS DAO layer with parameterized queries, transactions, and search/filtering | M2 | R2, Survey |
| F9 | CLI License Generator | Node CLI script `tools/generate-license.js` for Ed25519/ECDSA key generation and token signing | M3 | R4, Survey |
| F10 | Client License Verifier | Zero-dependency offline verification using browser `SubtleCrypto` and embedded public key | M3 | R4, Survey |
| F11 | Monotonic Anti-Tamper Clock | Monotonic timestamp tracker preventing clock rollback bypasses of the 30-day trial | M3 | R4, Survey |
| F12 | Selective Mutation Guard | Block INSERT for subscribers and invoices after 30-day trial expiry; keep reads/print/export fully functional | M3 | R4, Survey |
| F13 | Automated Rotating OPFS Backup | Automated snapshot trigger every 24h or 50 mutations, retaining last 7 snapshots in OPFS | M4 | R5, Survey |
| F14 | Binary SQLite Database Export | Timestamped `.sqlite` binary export supporting Web Share API and direct file download | M4 | R5, Survey |
| F15 | Multi-Stage Safe Restore | 16-byte magic header check, sandboxed `PRAGMA integrity_check`, pre-restore backup, and confirmation dialog | M4 | R5, Survey |
| F16 | Excel-Compatible Arabic CSV Export | UTF-8 BOM CSV export for subscribers, debt ledgers, payments, and fuel expenses | M4 | R5, Survey |
| F17 | Subscribers Management | Full CRUD, amperage values, line types (عادي/ذهبي/ليلي/صباحي), line states (نشط/مقطوع/معلق), Arabic normalized search | M5 | R6, Survey |
| F18 | Billing & Collections Engine | Monthly invoice calculation, Iraqi Dinar integer rules (`roundIQD`, `formatIQD`), cumulative debt carryover, receipt generation (`REC-YYYY-PREFIX-SEQ`), overpayment prevention | M5 | R6, Survey |
| F19 | Expenses & Diesel Tracking | Fuel liters, total cost, average price/liter, expense categories (كاز/زيت وفلاتر/صيانة/أجور/إيجار) | M5 | R6, Survey |
| F20 | Reports & Profit Analysis | Monthly balance sheet, collected vs due amounts, total debt, fuel expenses, net profit, generator capacity overload monitor | M5 | R6, Survey |
| F21 | Pure Vanilla TS UI Architecture | Modular Vanilla TypeScript DOM views, component lifecycles, and reactive state stores without heavy frameworks | M6 | R6, Survey |
| F22 | Arabic RTL Design System | Complete RTL layout `<html lang="ar" dir="rtl">`, Teal `#0E7490`, mobile bottom nav, 44px touch targets, dark/light theme | M6 | R6, Survey |
| F23 | Thermal Invoice & Printing | 58mm and 80mm selectable print styles, Arabic text reshaping, BiDi reordering, ESC/POS monochrome raster generator | M6 | R6, Survey |
| F24 | Service Worker & Zero-CDN Bundling | Local Cairo `.woff2` font, local wasm, Workbox offline precache, zero external network requests | M6 | R3, Survey |
| F25 | Comprehensive E2E Test Suite | Automated opaque-box tests covering Tiers 1-4 (Features, Boundaries, Pairwise, Real-World Scenarios) | M7 | Acceptance Criteria |
| F26 | Adversarial Hardening & Forensic Audit | White-box adversarial edge tests (Tier 5), code integrity verification, and zero-cheat compliance | M7 | Acceptance Criteria |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Platform Foundation, Security & Zero-CDN PWA Setup | F1, F2, F3, F4 | none | PLANNED |
| M2 | SQLite WASM & OPFS Storage Engine in Web Worker | F5, F6, F7, F8 | M1 | PLANNED |
| M3 | Cryptographic Offline Licensing & Anti-Tamper Trial Guard | F9, F10, F11, F12 | M2 | PLANNED |
| M4 | Backup, Restore & Data Integrity Engine | F13, F14, F15, F16 | M2, M3 | PLANNED |
| M5 | Financial Engine, Business Operations & Arabic Thermal Invoicing | F17, F18, F19, F20, F23 | M2 | PLANNED |
| M6 | Pure Vanilla TypeScript UI & Full Standalone Experience | F21, F22, F24 | M1, M2, M3, M4, M5 | PLANNED |
| M7 | E2E Test Pass (Tiers 1-4) & Adversarial Coverage Hardening (Tier 5) | F25, F26 | M1, M2, M3, M4, M5, M6 | PLANNED |

---

## Interface Contracts

### 1. Web Worker RPC Bridge (`src/db/bridge.ts` $\leftrightarrow$ `src/db/sqlite.worker.ts`)
```typescript
export interface DbRequest {
  id: string;
  action: 'exec' | 'query' | 'transaction' | 'export' | 'import' | 'backup' | 'restore';
  sql?: string;
  params?: any[];
  statements?: { sql: string; params?: any[] }[];
  binaryData?: Uint8Array;
}

export interface DbResponse {
  id: string;
  success: boolean;
  data?: any;
  error?: string;
}

export interface IDbBridge {
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  exec(sql: string, params?: any[]): Promise<{ rowsAffected: number; lastInsertRowid: number }>;
  transaction(statements: { sql: string; params?: any[] }[]): Promise<void>;
  exportDb(): Promise<Uint8Array>;
  importDb(data: Uint8Array): Promise<void>;
  createBackup(): Promise<string>;
  getStorageStats(): Promise<{ isPersisted: boolean; usageBytes: number; quotaBytes: number }>;
}
```

### 2. Cryptographic Licensing Engine (`src/services/licenseVerifier.ts` $\leftrightarrow$ `tools/generate-license.js`)
```typescript
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

export interface ITrialManager {
  isLicensed(): Promise<boolean>;
  getTrialStatus(): Promise<{
    daysRemaining: number;
    isExpired: boolean;
    effectiveTimestamp: number;
    isTrialActive: boolean;
  }>;
  verifyAndApplyLicenseKey(keyString: string): Promise<boolean>;
  canMutateCoreData(): Promise<boolean>;
}
```

### 3. Financial & Billing Service (`src/services/billingService.ts`)
```typescript
export function roundIQD(amount: number): number;
export function formatIQD(amount: number): string;
export function normalizeArabic(text: string): string;

export interface ISubscriberService {
  create(subscriber: Omit<Subscriber, 'id' | 'createdAt'>): Promise<number>;
  update(id: number, subscriber: Partial<Subscriber>): Promise<void>;
  delete(id: number): Promise<void>;
  getById(id: number): Promise<Subscriber | null>;
  search(filter: { query?: string; status?: string; lineType?: string }): Promise<Subscriber[]>;
}

export interface IBillingService {
  generateMonthlyCycle(month: number, year: number, defaultAmperePrice: number): Promise<number>;
  recordPayment(payment: {
    subscriberId: number;
    invoiceId: number;
    amount: number;
    note?: string;
  }): Promise<{ receiptNumber: string; remainingDebt: number }>;
  getDebtsList(): Promise<{ subscriber: Subscriber; totalDue: number; totalPaid: number; debt: number }[]>;
}
```

---

## Code Layout

```
d:\progect\power/
├── .agents/teamwork/             # Orchestrator & subagent metadata (plans, progress, handoffs)
├── tools/
│   └── generate-license.js       # Node CLI offline keypair generator & license signer
├── public/
│   ├── fonts/
│   │   └── cairo-arabic.woff2    # Bundled offline Arabic font
│   ├── wasm/
│   │   └── sqlite3.wasm          # Bundled official SQLite WebAssembly binary
│   ├── icons/                    # App icons (192, 512, maskable, SVG)
│   └── favicon.svg
├── src/
│   ├── config/
│   │   ├── app-config.ts         # App metadata, defaults, theme colors (#0E7490)
│   │   └── install-texts.ts      # Installation guidance texts & translations (R1)
│   ├── platform.ts               # Standalone, iOS Safari, browser detection (R1)
│   ├── db/
│   │   ├── sqlite.worker.ts      # Web Worker running SQLite WASM + OPFS (R2)
│   │   ├── bridge.ts             # Typed Promise RPC communication with worker (R2)
│   │   ├── schema.ts             # DDL migrations, tables, indices, initial seed (R2)
│   │   └── repositories/         # Typed data access objects (DAO)
│   ├── services/
│   │   ├── licenseVerifier.ts    # WebCrypto license token verifier & embedded public key (R4)
│   │   ├── trialManager.ts       # Anti-tamper 30-day monotonic clock & mutation guard (R4)
│   │   ├── backupService.ts      # OPFS 7-snapshot rotation, binary export, safe restore (R5)
│   │   ├── csvExportService.ts   # Excel-compatible UTF-8 BOM CSV exporter (R5)
│   │   ├── billingService.ts     # Invoicing, IQD math, debt ledger, overpayment guard (R6)
│   │   └── thermalPrinter.ts     # 58mm/80mm receipt templates, BiDi Arabic, ESC/POS raster (R6)
│   ├── ui/                       # Vanilla TypeScript UI Views & Components
│   │   ├── router.ts             # Client-side hash router
│   │   ├── components/           # Navbar, BottomNav, Banner, Modals, Forms, Tables
│   │   └── views/                # Subscribers, Billing, Expenses, Reports, Settings
│   ├── main.ts                   # Application entry point (Pure Vanilla TS)
│   └── index.css                 # CSS variables, RTL styles, print media queries
├── tests/
│   ├── e2e/                      # Opaque-box E2E test suite (Tiers 1-4)
│   │   ├── tier1_features/
│   │   ├── tier2_boundaries/
│   │   ├── tier3_pairwise/
│   │   └── tier4_scenarios/
│   └── adversarial/              # Adversarial coverage hardening (Tier 5)
├── index.html                    # Root HTML (dir="rtl", local font, local assets)
├── package.json                  # Clean dependencies (Vanilla TS + Vite + SQLite WASM)
├── vite.config.ts                # Vite PWA config with COOP/COEP headers
├── vercel.json                   # Production deployment config with COOP/COEP
└── README.md                     # Arabic production documentation
```
