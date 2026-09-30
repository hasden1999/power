# Ampereji (أمبيرجي) - E2E Testing Infrastructure Specification

## 1. Executive Summary & Purpose
This document establishes the official End-to-End (E2E) test architecture, automation harness, and test suite methodology for **Ampereji (أمبيرجي)** — the 100% Offline-First Standalone PWA for Iraqi private generator operators.

The test suite is built on **Node.js 24 native test runner (`node:test`, `node:assert/strict`)** with zero external dependencies, native TypeScript execution (`--experimental-strip-types`), native WebCrypto API (`crypto.subtle`), and full cross-platform compatibility (Windows PowerShell / Linux / macOS).

---

## 2. Test Architecture & Directory Layout

```
d:\progect\power/
├── TEST_INFRA.md                    # This document: Test architecture & methodologies
├── TEST_READY.md                    # Test execution verification & readiness report
├── tests/
│   └── e2e/
│       ├── harness/                 # Reusable test environment, drivers & fixtures
│       │   ├── env.ts               # In-memory simulated browser & storage context
│       │   ├── cryptoHelper.ts      # Ed25519/ECDSA test keypairs & license tokens
│       │   ├── dbDriver.ts          # SQLite/In-memory driver complying with IDbBridge
│       │   └── iraqiFixtures.ts     # Realistic Iraqi names, alleys, phone numbers & prices
│       ├── tier1_features/          # Tier 1: Feature Coverage (>=5 tests per feature)
│       │   ├── f01_f04_platform.test.ts        # Platform detection, banner, COOP/COEP
│       │   ├── f05_f08_database.test.ts        # SQLite worker, DDL, repositories, quota
│       │   ├── f09_f12_licensing.test.ts       # License generator, verifier, trial guard
│       │   ├── f13_f16_backup_restore.test.ts  # OPFS rotation, export, restore, CSV
│       │   ├── f17_f20_business_logic.test.ts  # Subscribers, billing, expenses, reports
│       │   └── f21_f24_ui_thermal_sw.test.ts   # UI store, RTL, thermal receipt, zero-CDN
│       ├── tier2_boundaries/        # Tier 2: Boundary & Corner Cases (>=5 tests per feature)
│       │   ├── boundary_platform.test.ts       # UserAgent spoofing, weird schemes, memory bounds
│       │   ├── boundary_database.test.ts       # SQL injection, huge blobs, transaction aborts
│       │   ├── boundary_licensing.test.ts      # Clock rollback, forged sigs, expired tokens
│       │   ├── boundary_backup.test.ts         # Corrupted SQLite headers, truncated files
│       │   ├── boundary_financial.test.ts      # IQD rounding, extreme amperes, negative sums
│       │   └── boundary_thermal.test.ts        # Complex Arabic ligatures, Harakat, 58mm overflow
│       ├── tier3_pairwise/          # Tier 3: Cross-Feature Combinations (Pairwise matrix)
│       │   ├── pairwise_subscribers_billing.test.ts  # CRUD + cycle + debt rollover
│       │   ├── pairwise_trial_mutations.test.ts      # Expiry + mutation guard + payments
│       │   ├── pairwise_backup_cycle.test.ts         # Mutations + 7-snapshot backup + restore
│       │   └── pairwise_thermal_export.test.ts       # Invoices + Arabic BiDi + CSV BOM
│       ├── tier4_scenarios/         # Tier 4: Real-World Iraqi Generator Operations
│       │   ├── scenario_jamia_lifecycle.test.ts      # Al-Jami'a 30-day complete onboarding & cycle
│       │   ├── scenario_trial_to_licensed.test.ts    # Day 31 trial expiry & offline license activation
│       │   ├── scenario_breakdown_recovery.test.ts   # Generator emergency, backup rotation & restore
│       │   └── scenario_tammuz_peak_summer.test.ts   # Peak July heat, diesel spikes, debt auditing
│       └── run-all.ts               # Autonomous master test runner & reporter
```

---

## 3. Four-Tier Testing Methodology

### Tier 1: Feature Coverage (Core Requirements)
- **Objective**: Verify that every single feature from the `PROJECT.md` Feature Inventory (F1 to F24) functions strictly according to its specification.
- **Rule**: Minimum 5 discrete, automated test cases per feature.
- **Scope**:
  - `F1` Platform Discovery: Standalone mode, iOS Safari detection, In-App browser detection, desktop/Android detection, user-agent parsing fidelity.
  - `F2` Smart Install Banner: Prompt handling, 3-day snooze logic, iOS step-by-step guidance rendering, persistence of dismiss choice.
  - `F3` Browser Mode Protection: Persistent storage block in normal browser, fallback to `:memory:`, persistent warning banner state.
  - `F4` COOP/COEP & Dev Server Security: SharedArrayBuffer enablement validation, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`.
  - `F5` SQLite WASM & OPFS Worker: Web Worker RPC message contract (`DbRequest`/`DbResponse`), async query execution, parameter binding, memory fallback.
  - `F6` DDL & Auto-Migration: Table schema creation (`subscribers`, `invoices`, `payments`, `expenses`, `settings`, `backup_logs`), foreign key constraints, index creation.
  - `F7` Storage Persistence & Quota: Calling `navigator.storage.persist()`, quota calculation, formatted byte display (KB/MB).
  - `F8` SQLite Repository Layer: Parameterized inserts, type-safe queries, transaction commit/rollback, multi-criteria filtering.
  - `F9` CLI License Generator: Keypair generation (Ed25519/ECDSA), payload serialization, cryptographic signing, CLI exit codes.
  - `F10` Client License Verifier: In-browser WebCrypto verification, signature rejection on tampering, payload decoding.
  - `F11` Monotonic Anti-Tamper Clock: System clock rollback detection, high-water mark timestamp progression, trial freeze on rewind.
  - `F12` Selective Mutation Guard: Trial active allow all, trial expired block subscriber addition, trial expired block new cycle, trial expired permit debt payments, trial expired permit expense logging and exports.
  - `F13` Automated Rotating OPFS Backup: Snapshot creation on 50 mutations, snapshot creation on 24h interval, rolling FIFO retention of last 7 backups.
  - `F14` Binary SQLite Database Export: Timestamped `.sqlite` file generation, Web Share API invocation or direct download blob creation.
  - `F15` Multi-Stage Safe Restore: 16-byte magic header validation (`SQLite format 3\0`), sandboxed `PRAGMA integrity_check`, pre-restore safety snapshot creation, rollback on corrupt input.
  - `F16` Excel-Compatible Arabic CSV Export: Inclusion of UTF-8 BOM (`\uFEFF`), properly quoted CSV fields, Arabic text preservation without corruption, comma escaping.
  - `F17` Subscribers Management: CRUD operations, phone number normalization, line types (`عادي`, `ذهبي`, `ليلي`, `صباحي`), line status transitions (`نشط`, `مقطوع`, `معلق`), Arabic search normalization (أ/إ/آ -> ا, ة -> ه, ى -> ي).
  - `F18` Billing & Collections Engine: Monthly cycle calculation, Iraqi Dinar integer rules (`roundIQD`, `formatIQD`), cumulative debt carryover, receipt numbering (`REC-YYYY-PREFIX-SEQ`), overpayment rejection.
  - `F19` Expenses & Diesel Tracking: Liter tracking for diesel purchases, average price calculation per liter, expense categories, total cost summation.
  - `F20` Reports & Profit Analysis: Collected revenue vs due amount, total outstanding debt ledger, diesel expense totals, net profit calculation, generator capacity overload warnings.
  - `F21` Pure Vanilla TS UI Architecture: Reactive state management, DOM component lifecycle without framework overhead, event dispatching.
  - `F22` Arabic RTL Design System: Proper RTL layout attributes (`dir="rtl"`), Teal primary color `#0E7490`, 44px minimum touch targets, dark/light theme switching.
  - `F23` Thermal Invoice & Printing: 58mm vs 80mm layout generation, Arabic text reshaping, BiDi reordering, ESC/POS monochrome bitmap command generation.
  - `F24` Service Worker & Zero-CDN Bundling: Zero external CDN URLs, local Cairo `.woff2` font declaration, offline precache manifest completeness.

### Tier 2: Boundary & Corner Cases
- **Objective**: Stress-test the application against extreme, adversarial, and boundary inputs.
- **Rule**: Minimum 5 test cases per feature category.
- **Scope**:
  - Financial boundaries: 0 IQD payments, negative amounts, fractions (e.g. 0.333 IQD), maximum safe integer amounts (e.g. billions of dinars), exact multiple of 250 IQD rounding.
  - Amperage boundaries: 0.25 amp (small LED lines), 0.5 amp, 100+ amps (commercial bakeries/factories), fractional amps with 2 decimal places.
  - String boundaries: 500-character subscriber names, zero-length strings, emoji in addresses, whitespace-only input, multiline notes.
  - Arabic linguistics: Quranic diacritics (Tashkeel: Shaddah, Tanween, Dammah, Kasrah, Fathah, Sukun), Persian/Kurdish characters (گ, چ, پ, ژ), mixed Arabic-English-Numeral text.
  - Cryptographic tampering: Flipping 1 bit in signature, altered expiration date in payload, future-dated licenses, malformed base64 strings.
  - Database boundaries: Rapid concurrent operations, SQL syntax injection strings in name/phone fields (`' OR '1'='1`), binary zero bytes (`\0`), max statement sizes.
  - File restore boundaries: Truncated 10-byte file, text file renamed to `.sqlite`, zero-byte file, valid SQLite file with corrupted internal page index.

### Tier 3: Cross-Feature Combinations (Pairwise Coverage)
- **Objective**: Verify that features behave predictably when interacting with each other.
- **Scope**:
  - Subscriber Mutation $\leftrightarrow$ Billing Engine $\leftrightarrow$ Debt Calculation.
  - Trial Expiration $\leftrightarrow$ Selective Mutation Guard $\leftrightarrow$ Debt Payment Recording.
  - Rapid Data Mutations $\leftrightarrow$ 50-Mutation Trigger $\leftrightarrow$ 7-Snapshot Rotation $\leftrightarrow$ Safe Restore.
  - Arabic Text Reshaping $\leftrightarrow$ BiDi Reordering $\leftrightarrow$ Thermal ESC/POS Byte Stream $\leftrightarrow$ CSV Export BOM.
  - Monotonic Clock Rollback $\leftrightarrow$ Trial Status $\leftrightarrow$ License Verifier Activation.

### Tier 4: Real-World Iraqi Generator Operations Scenarios
- **Objective**: Execute multi-step, realistic business workflows mirroring the daily reality of Iraqi private generator operators ("أصحاب المولدات الأهلية").
- **Scenarios**:
  1. **"حي الجامعة" (Al-Jami'a Neighborhood) 30-Day Launch**:
     - Operator registers generator "مولدة حي الجامعة الأهلية" with 500 kVA capacity.
     - Registers 50 subscribers across ordinary (عادي), golden (ذهبي), and night (ليلي) lines.
     - Issues month 1 billing cycle at 12,000 IQD / amp (normal) and 18,000 IQD / amp (gold).
     - Collects daily payments from 40 subscribers; 10 carry over debt.
     - Logs 2 diesel tank refills (1,500 Liters @ 750 IQD/L) and 1 oil change (120,000 IQD).
     - Produces end-of-month balance sheet: checks total revenue, diesel cost, net profit, and outstanding debt list.
  2. **Trial Expiration & Seamless Offline Licensing**:
     - System runs through 30 days of free trial.
     - On Day 31, operator attempts to add a new subscriber: blocked with user-friendly Arabic notification.
     - Operator attempts to issue new cycle: blocked.
     - Operator collects payment from existing debtor: **allowed and receipt printed**.
     - Operator purchases license from platform administrator: admin runs CLI generator to produce `AMP1.<token>`.
     - Operator pastes key into settings: system verifies via WebCrypto, activates lifetime license, unblocks all operations.
  3. **Catastrophic Hardware/Data Breakdown & Safe Recovery**:
     - High mutation activity triggers rotating snapshots (slots 1 to 7).
     - Accidental wipe or page corruption occurs.
     - Operator selects yesterday's backup file.
     - System inspects header, sandboxes `PRAGMA integrity_check`, takes pre-restore emergency snapshot, and confirms restore.
     - All 50 subscribers, payment history, and invoices restored with 100% data fidelity.
  4. **Peak Summer Heat (تموز / آب - Iraqi Summer Load)**:
     - 50°C summer conditions in Baghdad. High demand for air conditioning.
     - Subscriber amperage upgrades (from 5A to 8A).
     - Extreme fuel consumption (daily 500L diesel batches at volatile prices: 850 IQD/L).
     - Mid-month partial payments and promissory debts.
     - Capacity overload check warns operator when total registered amperage exceeds generator safe threshold (80% of kVA).
     - Full Arabic CSV export generated with UTF-8 BOM, opened and verified for Iraqi Ministry of Oil audit.

---

## 4. Execution & Verification Commands

All tests execute with standard Node.js without requiring external testing tools:

```powershell
# Run the complete autonomous E2E test suite (All Tiers)
node --experimental-strip-types tests/e2e/run-all.ts

# Run individual Tiers
node --test --experimental-strip-types tests/e2e/tier1_features/*.test.ts
node --test --experimental-strip-types tests/e2e/tier2_boundaries/*.test.ts
node --test --experimental-strip-types tests/e2e/tier3_pairwise/*.test.ts
node --test --experimental-strip-types tests/e2e/tier4_scenarios/*.test.ts
```

---

## 5. Exit Criteria & Readiness Standard
The test suite is deemed **READY** when:
1. `TEST_INFRA.md` is approved and published.
2. All Tier 1, Tier 2, Tier 3, and Tier 4 test suites are implemented in `tests/e2e/`.
3. Test runner executes cleanly with 0 unhandled rejections.
4. Total test case count exceeds 150+ discrete, meaningful assertions.
5. All tests verify business requirements directly against `ORIGINAL_REQUEST.md` and `PROJECT.md` contracts.
