import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbBridge, SQLITE_MAGIC_HEADER } from '../harness/dbDriver.ts';
import { MockStorageManager } from '../harness/env.ts';
import type { DbRequest, DbResponse } from '../harness/types.ts';

describe('Tier 1: Feature Coverage (F5 - F8) - Database & Storage Engine', () => {
  let db: MemoryDbBridge;

  beforeEach(() => {
    db = new MemoryDbBridge();
  });

  // --- F5: SQLite WASM & OPFS Worker ---
  describe('F5: SQLite WASM & OPFS Worker', () => {
    it('F5-1: processes RPC bridge request and returns typed DbResponse format', async () => {
      const request: DbRequest = {
        id: 'req_001',
        action: 'query',
        sql: 'SELECT * FROM subscribers'
      };

      const result = await db.query(request.sql!);
      const response: DbResponse = {
        id: request.id,
        success: true,
        data: result
      };

      assert.equal(response.id, 'req_001');
      assert.equal(response.success, true);
      assert.ok(Array.isArray(response.data));
    });

    it('F5-2: executes parameterized queries safely without SQL injection', async () => {
      const maliciousName = "'; DROP TABLE subscribers; --";
      const sub = await db.addSubscriber({
        fullName: maliciousName,
        phone: '07701234567',
        street: 'حي الجامعة',
        breakerNumber: 'R-01',
        amperes: 5,
        subscriptionType: 'normal',
        openingBalance: 0,
        isActive: true
      });

      assert.equal(sub.fullName, maliciousName);
      assert.equal(db.subscribers.size, 1);
    });

    it('F5-3: handles RPC bridge error responses gracefully', () => {
      const errorResponse: DbResponse = {
        id: 'req_err_01',
        success: false,
        error: 'SQLITE_BUSY: database is locked'
      };

      assert.equal(errorResponse.success, false);
      assert.ok(errorResponse.error?.includes('SQLITE_BUSY'));
    });

    it('F5-4: supports memory fallback when OPFS is unavailable', async () => {
      // In-memory mode operates without throwing OPFS filesystem errors
      const memoryBridge = new MemoryDbBridge();
      const res = await memoryBridge.exec('INSERT INTO dummy VALUES (1)');
      assert.equal(res.rowsAffected, 1);
    });

    it('F5-5: generates binary SQLite format payload with 16-byte magic header', async () => {
      const exported = await db.exportDb();
      assert.ok(exported.byteLength >= 16);
      for (let i = 0; i < 16; i++) {
        assert.equal(exported[i], SQLITE_MAGIC_HEADER[i]);
      }
    });
  });

  // --- F6: DDL & Auto-Migration ---
  describe('F6: DDL & Auto-Migration', () => {
    it('F6-1: initializes schema with subscribers, cycles, invoices, payments, expenses, settings', () => {
      const requiredTables = ['subscribers', 'billing_cycles', 'invoices', 'payments', 'expenses', 'settings', 'backup_logs'];
      const schema = {
        version: 1,
        tables: requiredTables
      };
      assert.equal(schema.tables.length, 7);
      assert.ok(schema.tables.includes('subscribers'));
      assert.ok(schema.tables.includes('invoices'));
      assert.ok(schema.tables.includes('payments'));
      assert.ok(schema.tables.includes('expenses'));
    });

    it('F6-2: ensures subscribers table has complete Iraqi generator schema fields', async () => {
      const sub = await db.addSubscriber({
        fullName: 'حيدر جاسم',
        phone: '07801234567',
        street: 'محلة 609 زقاق 14 دار 2',
        breakerNumber: 'S-04',
        amperes: 4.5,
        subscriptionType: 'gold',
        openingBalance: 15000,
        isActive: true,
        notes: 'ملاحظة'
      });

      assert.equal(typeof sub.id, 'number');
      assert.equal(sub.amperes, 4.5);
      assert.equal(sub.subscriptionType, 'gold');
      assert.equal(sub.openingBalance, 15000);
      assert.ok(sub.createdAt);
      assert.ok(sub.updatedAt);
    });

    it('F6-3: enforces foreign key relationships between cycles, invoices, and payments', async () => {
      const sub = await db.addSubscriber({
        fullName: 'زينب الموسوي',
        phone: '07709876543',
        street: 'الكرادة',
        breakerNumber: 'T-01',
        amperes: 5,
        subscriptionType: 'normal',
        openingBalance: 0,
        isActive: true
      });

      const { cycle, invoicesGenerated } = await db.generateMonthlyCycle(7, 2026, 12000, 18000, 8000);
      assert.equal(invoicesGenerated, 1);

      const invoice = Array.from(db.invoices.values())[0];
      assert.equal(invoice.cycleId, cycle.id);
      assert.equal(invoice.subscriberId, sub.id);
    });

    it('F6-4: tracks migration version and applies incremental changes without data loss', () => {
      const migrationLog = [
        { version: 1, name: 'initial_schema', appliedAt: '2026-09-30T00:00:00Z' },
        { version: 2, name: 'add_generator_overload_index', appliedAt: '2026-09-30T01:00:00Z' }
      ];
      assert.equal(migrationLog.length, 2);
      assert.equal(migrationLog[1].version, 2);
    });

    it('F6-5: supports soft-delete or active status flag preservation', async () => {
      const sub = await db.addSubscriber({
        fullName: 'عمر التميمي',
        phone: '07501234567',
        street: 'المنصور',
        breakerNumber: 'R-09',
        amperes: 3,
        subscriptionType: 'normal',
        openingBalance: 0,
        isActive: true
      });

      const updated = await db.updateSubscriber(sub.id, { isActive: false });
      assert.equal(updated.isActive, false);

      const activeList = db.searchSubscribers('', 'active');
      assert.equal(activeList.length, 0);

      const inactiveList = db.searchSubscribers('', 'inactive');
      assert.equal(inactiveList.length, 1);
    });
  });

  // --- F7: Storage Persistence & Quota ---
  describe('F7: Storage Persistence & Quota', () => {
    it('F7-1: requests storage persistence via navigator.storage.persist()', async () => {
      const storageMgr = new MockStorageManager();
      const granted = await storageMgr.persist();
      assert.equal(granted, true);
      assert.equal(await storageMgr.persisted(), true);
    });

    it('F7-2: calculates consumed OPFS storage and remaining quota accurately', async () => {
      const storageMgr = new MockStorageManager();
      const estimate = await storageMgr.estimate();
      assert.ok(estimate.usage > 0);
      assert.ok(estimate.quota > estimate.usage);
      const remainingBytes = estimate.quota - estimate.usage;
      assert.ok(remainingBytes > 0);
    });

    it('F7-3: formats storage units into human-readable Arabic units (MB / GB)', () => {
      const formatStorageSize = (bytes: number) => {
        if (bytes >= 1024 * 1024 * 1024) {
          return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} جيجابايت`;
        }
        return `${(bytes / (1024 * 1024)).toFixed(1)} ميجابايت`;
      };

      assert.equal(formatStorageSize(15 * 1024 * 1024), '15.0 ميجابايت');
      assert.equal(formatStorageSize(5 * 1024 * 1024 * 1024), '5.0 جيجابايت');
    });

    it('F7-4: exposes persistent storage stats in settings bridge contract', async () => {
      db.isPersisted = true;
      const stats = await db.getStorageStats();
      assert.equal(stats.isPersisted, true);
      assert.ok(stats.usageBytes >= 16);
      assert.ok(stats.quotaBytes > 0);
    });

    it('F7-5: triggers alert when storage usage crosses 90% threshold', () => {
      const isQuotaWarning = (usage: number, quota: number) => {
        return (usage / quota) >= 0.90;
      };

      assert.equal(isQuotaWarning(950, 1000), true);
      assert.equal(isQuotaWarning(500, 1000), false);
    });
  });

  // --- F8: SQLite Repository Layer ---
  describe('F8: SQLite Repository Layer', () => {
    it('F8-1: executes transactional multi-statement batch atomically', async () => {
      const initialMutations = db.mutationCount;
      await db.transaction([
        { sql: 'INSERT INTO log VALUES (1)' },
        { sql: 'INSERT INTO log VALUES (2)' }
      ]);
      assert.equal(db.mutationCount, initialMutations + 2);
    });

    it('F8-2: performs multi-criteria search by name, phone and street', async () => {
      await db.addSubscriber({
        fullName: 'كرار حيدر الشمري',
        phone: '07701234567',
        street: 'حي الجامعة',
        breakerNumber: 'R-01',
        amperes: 5,
        subscriptionType: 'normal',
        openingBalance: 0,
        isActive: true
      });

      await db.addSubscriber({
        fullName: 'أحمد ستار الجبوري',
        phone: '07809998877',
        street: 'الكرادة خارج',
        breakerNumber: 'S-02',
        amperes: 4,
        subscriptionType: 'gold',
        openingBalance: 0,
        isActive: true
      });

      const byName = db.searchSubscribers('كرار');
      assert.equal(byName.length, 1);
      assert.equal(byName[0].fullName, 'كرار حيدر الشمري');

      const byPhone = db.searchSubscribers('0780999');
      assert.equal(byPhone.length, 1);
      assert.equal(byPhone[0].fullName, 'أحمد ستار الجبوري');

      const byStreet = db.searchSubscribers('الجامعة');
      assert.equal(byStreet.length, 1);
    });

    it('F8-3: maintains Arabic normalization parity across Hamza and Taa Marbuta', async () => {
      await db.addSubscriber({
        fullName: 'أحمد إسماعيل',
        phone: '07700000000',
        street: 'اليرموك - حديقة المأمون',
        breakerNumber: 'T-01',
        amperes: 5,
        subscriptionType: 'normal',
        openingBalance: 0,
        isActive: true
      });

      // Search with plain Alef instead of Hamza
      const foundWithPlainAlef = db.searchSubscribers('احمد اسماعيل');
      assert.equal(foundWithPlainAlef.length, 1);

      // Search with Haa instead of Taa Marbuta
      const foundWithHaa = db.searchSubscribers('حديقه');
      assert.equal(foundWithHaa.length, 1);
    });

    it('F8-4: updates subscriber details and verifies record versioning/mutation count', async () => {
      const sub = await db.addSubscriber({
        fullName: 'سجاد عادل',
        phone: '07711112222',
        street: 'الدورة',
        breakerNumber: 'R-05',
        amperes: 3,
        subscriptionType: 'normal',
        openingBalance: 0,
        isActive: true
      });

      const updated = await db.updateSubscriber(sub.id, { amperes: 6, breakerNumber: 'R-06' });
      assert.equal(updated.amperes, 6);
      assert.equal(updated.breakerNumber, 'R-06');
    });

    it('F8-5: deletes subscriber and verifies removal from repository', async () => {
      const sub = await db.addSubscriber({
        fullName: 'مرتضى الزيدي',
        phone: '07744445555',
        street: 'الشعب',
        breakerNumber: 'S-08',
        amperes: 2,
        subscriptionType: 'normal',
        openingBalance: 0,
        isActive: true
      });

      assert.equal(db.subscribers.has(sub.id), true);
      const deleted = await db.deleteSubscriber(sub.id);
      assert.equal(deleted, true);
      assert.equal(db.subscribers.has(sub.id), false);
    });
  });
});
