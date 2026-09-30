import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbBridge, SQLITE_MAGIC_HEADER } from '../harness/dbDriver.ts';

describe('Tier 2: Boundary & Corner Cases - Backup & Restore Engine', () => {
  let db: MemoryDbBridge;

  beforeEach(() => {
    db = new MemoryDbBridge();
  });

  it('B-BK-1: rejects file of exactly 15 bytes (1 byte short of magic header)', async () => {
    const fifteenBytes = SQLITE_MAGIC_HEADER.subarray(0, 15);
    await assert.rejects(
      async () => {
        await db.importDb(fifteenBytes);
      },
      /Invalid SQLite database: file too small/
    );
  });

  it('B-BK-2: rejects file where 16th byte is altered from 0x00 to 0x01', async () => {
    const headerCorrupt = new Uint8Array(SQLITE_MAGIC_HEADER);
    headerCorrupt[15] = 0x01; // Should be 0x00 ('\0')

    await assert.rejects(
      async () => {
        await db.importDb(headerCorrupt);
      },
      /Invalid SQLite magic header/
    );
  });

  it('B-BK-3: rejects zero-byte empty file restore attempt', async () => {
    const emptyFile = new Uint8Array(0);
    await assert.rejects(
      async () => {
        await db.importDb(emptyFile);
      },
      /Invalid SQLite database: file too small/
    );
  });

  it('B-BK-4: rejects valid 16-byte header followed by truncated or malformed payload', async () => {
    const header = new Uint8Array(SQLITE_MAGIC_HEADER);
    const corruptedTail = new TextEncoder().encode('{"subscribers": [unclosed json');

    const total = new Uint8Array(header.length + corruptedTail.length);
    total.set(header, 0);
    total.set(corruptedTail, header.length);

    await assert.rejects(
      async () => {
        await db.importDb(total);
      },
      /integrity_check failed/
    );
  });

  it('B-BK-5: handles backup and restore of 1000 subscribers without payload degradation', async () => {
    for (let i = 1; i <= 1000; i++) {
      db.subscribers.set(i, {
        id: i,
        fullName: `مشترك رقم ${i}`,
        phone: `0770${String(i).padStart(7, '0')}`,
        street: 'شارع رقم 1',
        breakerNumber: `B-${i}`,
        amperes: 5,
        subscriptionType: 'normal',
        openingBalance: 0,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    const binary = await db.exportDb();
    const freshDb = new MemoryDbBridge();
    await freshDb.importDb(binary);

    assert.equal(freshDb.subscribers.size, 1000);
    assert.equal(freshDb.subscribers.get(500)?.fullName, 'مشترك رقم 500');
  });

  it('B-BK-6: retains strictly last 7 snapshots across 100 consecutive manual backup requests', async () => {
    for (let i = 0; i < 100; i++) {
      await db.createBackup();
    }
    assert.equal(db.backupSlots.length, 7);
  });
});
