import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbBridge } from '../harness/dbDriver.ts';

describe('Tier 3: Cross-Feature Combinations - Mutations, Backup Rotation & Restore Pairwise', () => {
  let db: MemoryDbBridge;

  beforeEach(() => {
    db = new MemoryDbBridge();
  });

  it('PW-BR-1: 50-mutation triggers rotating snapshot and recovers state following catastrophic wipe', async () => {
    // 1. Add 49 subscribers
    for (let i = 1; i <= 49; i++) {
      await db.addSubscriber({
        fullName: `مشترك ${i}`,
        phone: `0770${String(i).padStart(7, '0')}`,
        street: 'شارع 1',
        breakerNumber: `B-${i}`,
        amperes: 5,
        subscriptionType: 'normal',
        openingBalance: 0,
        isActive: true
      });
    }
    assert.equal(db.backupSlots.length, 0);

    // 2. 50th subscriber triggers automated snapshot!
    await db.addSubscriber({
      fullName: 'مشترك 50 الحاسم',
      phone: '07700000050',
      street: 'شارع 1',
      breakerNumber: 'B-50',
      amperes: 5,
      subscriptionType: 'normal',
      openingBalance: 0,
      isActive: true
    });
    assert.equal(db.backupSlots.length, 1);
    const snapshotAt50 = db.backupSlots[0].data;

    // 3. Catastrophic data loss: database wiped
    db.subscribers.clear();
    db.invoices.clear();
    assert.equal(db.subscribers.size, 0);

    // 4. Safe restore from snapshotAt50
    await db.importDb(snapshotAt50);
    assert.equal(db.subscribers.size, 50);
    assert.equal(db.subscribers.get(50)?.fullName, 'مشترك 50 الحاسم');
  });

  it('PW-BR-2: FIFO 7-slot rolling retention purges oldest snapshot when 8th snapshot occurs', async () => {
    // Trigger 8 snapshots by creating 400 mutations
    for (let i = 0; i < 400; i++) {
      await db.exec(`INSERT INTO dummy VALUES (${i})`);
    }

    assert.equal(db.backupSlots.length, 7);
    // Newest snapshot is at index 0, oldest retained is at index 6
    assert.ok(db.backupSlots[0].timestamp >= db.backupSlots[6].timestamp);
  });

  it('PW-BR-3: restore rolls back accidental deletion of subscribers', async () => {
    const sub = await db.addSubscriber({
      fullName: 'حيدر جاسم',
      phone: '07719876543',
      street: 'حي الجامعة',
      breakerNumber: 'R-01',
      amperes: 6,
      subscriptionType: 'normal',
      openingBalance: 0,
      isActive: true
    });

    // Take snapshot
    const backupData = await db.exportDb();

    // Accidental delete
    await db.deleteSubscriber(sub.id);
    assert.equal(db.subscribers.has(sub.id), false);

    // Restore from snapshot
    await db.importDb(backupData);
    assert.equal(db.subscribers.has(sub.id), true);
    assert.equal(db.subscribers.get(sub.id)?.fullName, 'حيدر جاسم');
  });
});
