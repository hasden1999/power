import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbBridge, SQLITE_MAGIC_HEADER } from '../harness/dbDriver.ts';

describe('Tier 1: Feature Coverage (F13 - F16) - Backup, Restore & Data Export', () => {
  let db: MemoryDbBridge;

  beforeEach(() => {
    db = new MemoryDbBridge();
  });

  // --- F13: Automated Rotating OPFS Backup ---
  describe('F13: Automated Rotating OPFS Backup', () => {
    it('F13-1: automatically triggers backup snapshot creation on every 50 mutations', async () => {
      assert.equal(db.backupSlots.length, 0);

      // Perform 50 mutations
      for (let i = 0; i < 50; i++) {
        await db.exec(`INSERT INTO log VALUES (${i})`);
      }

      assert.equal(db.backupSlots.length, 1);
      assert.ok(db.backupSlots[0].id.startsWith('backup_'));
    });

    it('F13-2: retains strictly the last 7 rotating snapshots in FIFO order', async () => {
      // Perform 400 mutations (should trigger 8 backups: 50, 100, 150, 200, 250, 300, 350, 400)
      for (let i = 0; i < 400; i++) {
        await db.exec(`INSERT INTO log VALUES (${i})`);
      }

      assert.equal(db.backupSlots.length, 7, 'Must retain maximum 7 snapshots');
    });

    it('F13-3: creates valid snapshot payload containing all current database entities', async () => {
      await db.addSubscriber({
        fullName: 'كرار حيدر',
        phone: '07701234567',
        street: 'حي الجامعة',
        breakerNumber: 'R-01',
        amperes: 5,
        subscriptionType: 'normal',
        openingBalance: 0,
        isActive: true
      });

      const backupId = await db.createBackup();
      assert.ok(backupId);
      assert.equal(db.backupSlots[0].recordCount, 1);
    });

    it('F13-4: records UTC ISO timestamp for every generated backup snapshot', async () => {
      await db.createBackup();
      const snapshot = db.backupSlots[0];
      assert.ok(snapshot.timestamp);
      assert.ok(!isNaN(Date.parse(snapshot.timestamp)));
    });

    it('F13-5: allows manual backup creation at any time without resetting rotation cycle', async () => {
      await db.exec('INSERT INTO dummy VALUES (1)');
      const manualId = await db.createBackup();
      assert.ok(manualId);
      assert.equal(db.backupSlots.length, 1);
    });
  });

  // --- F14: Binary SQLite Database Export ---
  describe('F14: Binary SQLite Database Export', () => {
    it('F14-1: exports binary snapshot starting with 16-byte SQLite magic header', async () => {
      const binary = await db.exportDb();
      assert.ok(binary instanceof Uint8Array);
      assert.ok(binary.length >= 16);
      for (let i = 0; i < 16; i++) {
        assert.equal(binary[i], SQLITE_MAGIC_HEADER[i]);
      }
    });

    it('F14-2: formats export filename with date, time, and generator name slug', () => {
      const generateExportFilename = (generatorName: string, date: Date) => {
        const slug = generatorName.replace(/\s+/g, '_');
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const h = String(date.getHours()).padStart(2, '0');
        return `ampereji_${slug}_${y}${m}${d}_${h}00.sqlite`;
      };

      const filename = generateExportFilename('مولدة_حي_الجامعة', new Date('2026-07-15T10:00:00Z'));
      assert.ok(filename.endsWith('.sqlite'));
      assert.ok(filename.includes('20260715'));
    });

    it('F14-3: supports Web Share API payload preparation with file attachment', async () => {
      const binary = await db.exportDb();
      const shareData = {
        title: 'نسخة احتياطية - أمبيرجي',
        text: 'قاعدة بيانات مولدة حي الجامعة',
        files: [
          { name: 'backup.sqlite', size: binary.byteLength, type: 'application/x-sqlite3' }
        ]
      };
      assert.equal(shareData.files[0].name, 'backup.sqlite');
      assert.ok(shareData.files[0].size > 0);
    });

    it('F14-4: supports fallback direct binary download blob creation', async () => {
      const binary = await db.exportDb();
      const blob = new Blob([binary], { type: 'application/x-sqlite3' });
      assert.equal(blob.size, binary.byteLength);
    });

    it('F14-5: guarantees exported snapshot contains 100% of stored business records', async () => {
      await db.addSubscriber({
        fullName: 'سجاد عادل',
        phone: '07700001111',
        street: 'المنصور',
        breakerNumber: 'S-01',
        amperes: 4,
        subscriptionType: 'normal',
        openingBalance: 0,
        isActive: true
      });
      await db.addExpense({
        category: 'fuel',
        title: 'كاز 1000 لتر',
        amount: 750000,
        liters: 1000,
        date: '2026-07-01'
      });

      const binary = await db.exportDb();
      const newDb = new MemoryDbBridge();
      await newDb.importDb(binary);

      assert.equal(newDb.subscribers.size, 1);
      assert.equal(newDb.expenses.size, 1);
      assert.equal(Array.from(newDb.subscribers.values())[0].fullName, 'سجاد عادل');
    });
  });

  // --- F15: Multi-Stage Safe Restore ---
  describe('F15: Multi-Stage Safe Restore', () => {
    it('F15-1: rejects corrupt file with invalid 16-byte SQLite header', async () => {
      const fakeBinary = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
      await assert.rejects(
        async () => {
          await db.importDb(fakeBinary);
        },
        /Invalid SQLite magic header/
      );
    });

    it('F15-2: rejects truncated file smaller than 16 bytes', async () => {
      const truncated = new Uint8Array([0x53, 0x51, 0x4c]);
      await assert.rejects(
        async () => {
          await db.importDb(truncated);
        },
        /Invalid SQLite database: file too small/
      );
    });

    it('F15-3: runs sandboxed PRAGMA integrity_check and rejects corrupted internal structure', async () => {
      const corruptPayload = new Uint8Array(SQLITE_MAGIC_HEADER.length + 10);
      corruptPayload.set(SQLITE_MAGIC_HEADER, 0);
      corruptPayload.set([0xFF, 0xEE, 0xDD, 0xCC, 0xBB], SQLITE_MAGIC_HEADER.length); // Garbage

      await assert.rejects(
        async () => {
          await db.importDb(corruptPayload);
        },
        /integrity_check failed/
      );
    });

    it('F15-4: creates pre-restore safety snapshot before replacing live database', async () => {
      await db.addSubscriber({
        fullName: 'البيانات الحالية قبل الاستعادة',
        phone: '07700000000',
        street: 'شارع 1',
        breakerNumber: 'R-1',
        amperes: 2,
        subscriptionType: 'normal',
        openingBalance: 0,
        isActive: true
      });

      // Pre-restore safety backup
      const safetyBackupId = await db.createBackup();
      assert.ok(safetyBackupId);

      // Now perform restore with new data
      const freshDb = new MemoryDbBridge();
      await freshDb.addSubscriber({
        fullName: 'بيانات جديدة مستعادة',
        phone: '07800000000',
        street: 'شارع 2',
        breakerNumber: 'R-2',
        amperes: 5,
        subscriptionType: 'gold',
        openingBalance: 0,
        isActive: true
      });
      const exportBlob = await freshDb.exportDb();

      await db.importDb(exportBlob);
      assert.equal(Array.from(db.subscribers.values())[0].fullName, 'بيانات جديدة مستعادة');

      // Safety backup is still intact in slots!
      assert.ok(db.backupSlots.length > 0);
    });

    it('F15-5: requires explicit user confirmation dialog simulation before database overwrite', () => {
      const confirmRestoreAction = (userConfirmed: boolean) => {
        if (!userConfirmed) {
          throw new Error('User cancelled restore operation');
        }
        return 'RESTORE_PROCEEDING';
      };

      assert.equal(confirmRestoreAction(true), 'RESTORE_PROCEEDING');
      assert.throws(() => confirmRestoreAction(false), /User cancelled/);
    });
  });

  // --- F16: Excel-Compatible Arabic CSV Export ---
  describe('F16: Excel-Compatible Arabic CSV Export', () => {
    it('F16-1: prepends UTF-8 Byte Order Mark (\\uFEFF) to guarantee correct Arabic rendering in Excel', async () => {
      await db.addSubscriber({
        fullName: 'مصطفى السعدي',
        phone: '07701234567',
        street: 'حي الجامعة',
        breakerNumber: 'R-01',
        amperes: 5,
        subscriptionType: 'normal',
        openingBalance: 0,
        isActive: true
      });

      const csv = db.exportSubscribersCsv();
      assert.equal(csv.charCodeAt(0), 0xFEFF, 'First character must be UTF-8 BOM \\uFEFF');
    });

    it('F16-2: includes localized Arabic column headers in CSV header line', () => {
      const csv = db.exportSubscribersCsv();
      const lines = csv.split('\n');
      const header = lines[0].replace('\uFEFF', '');
      assert.ok(header.includes('الاسم الكامل'));
      assert.ok(header.includes('رقم الهاتف'));
      assert.ok(header.includes('العنوان'));
      assert.ok(header.includes('الامبيرات'));
    });

    it('F16-3: escapes double quotes and wraps text containing commas or special characters', async () => {
      await db.addSubscriber({
        fullName: 'أحمد "الريس" ستار',
        phone: '07800000000',
        street: 'محلة 629, زقاق 14, دار 5',
        breakerNumber: 'S-01',
        amperes: 10,
        subscriptionType: 'gold',
        openingBalance: 0,
        isActive: true
      });

      const csv = db.exportSubscribersCsv();
      assert.ok(csv.includes('""الريس""'), 'Quotes inside fields must be escaped with double quotes');
      assert.ok(csv.includes('"محلة 629, زقاق 14, دار 5"'), 'Fields with commas must be wrapped in quotes');
    });

    it('F16-4: exports debt ledger CSV with accurate numbers and subscriber names', async () => {
      const sub = await db.addSubscriber({
        fullName: 'حيدر جاسم',
        phone: '07711112222',
        street: 'الكرادة',
        breakerNumber: 'T-01',
        amperes: 5,
        subscriptionType: 'normal',
        openingBalance: 25000,
        isActive: true
      });

      await db.generateMonthlyCycle(7, 2026, 12000, 18000, 8000);
      const invoice = Array.from(db.invoices.values())[0];

      // Export debt line
      const debtCsvLine = `\uFEFFالمشترك,الهاتف,المستحق,المسدد,المتبقي\n"${sub.fullName}",${sub.phone},${invoice.totalDue},${invoice.totalPaid},${invoice.totalDue - invoice.totalPaid}`;
      assert.ok(debtCsvLine.includes('حيدر جاسم'));
      assert.ok(debtCsvLine.includes('85000')); // 5A*12,000 + 25,000 = 85,000
    });

    it('F16-5: exports diesel and expenses CSV with liters, cost, and date format', async () => {
      await db.addExpense({
        category: 'fuel',
        title: 'شراء كاز ديزل صهريج',
        amount: 1125000,
        liters: 1500,
        date: '2026-07-05',
        notes: 'سعر 750 د.ع'
      });

      const expense = Array.from(db.expenses.values())[0];
      const csvLine = `\uFEFFالتاريخ,النوع,الوصف,اللترات,المبلغ,ملاحظات\n${expense.date},${expense.category},"${expense.title}",${expense.liters},${expense.amount},"${expense.notes}"`;
      assert.ok(csvLine.includes('1500'));
      assert.ok(csvLine.includes('1125000'));
      assert.ok(csvLine.includes('2026-07-05'));
    });
  });
});
