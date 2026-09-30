import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbBridge } from '../harness/dbDriver.ts';

describe('Tier 2: Boundary & Corner Cases - Database & Repositories', () => {
  let db: MemoryDbBridge;

  beforeEach(() => {
    db = new MemoryDbBridge();
  });

  it('B-DB-1: handles complex SQL injection attacks in subscriber fields safely', async () => {
    const maliciousInputs = [
      "' OR 1=1 --",
      "admin' --",
      "'; EXEC xp_cmdshell('dir'); --",
      "1; DROP TABLE subscribers; --",
      "UNION SELECT username, password FROM users --"
    ];

    for (const input of maliciousInputs) {
      const sub = await db.addSubscriber({
        fullName: input,
        phone: input,
        street: input,
        breakerNumber: 'B-01',
        amperes: 5,
        subscriptionType: 'normal',
        openingBalance: 0,
        isActive: true
      });
      assert.equal(sub.fullName, input);
      const found = db.searchSubscribers(input);
      assert.ok(found.length >= 1);
    }
    // Database integrity preserved
    assert.equal(db.subscribers.size, maliciousInputs.length);
  });

  it('B-DB-2: supports massive 10,000-character notes field without truncation', async () => {
    const hugeNotes = 'ملاحظة مولدة '.repeat(1000);
    const sub = await db.addSubscriber({
      fullName: 'مشترك بنص ضخم',
      phone: '07700000000',
      street: 'الشارع',
      breakerNumber: 'R-01',
      amperes: 5,
      subscriptionType: 'normal',
      openingBalance: 0,
      isActive: true,
      notes: hugeNotes
    });

    assert.equal(sub.notes?.length, hugeNotes.length);
  });

  it('B-DB-3: stores and retrieves Unicode emojis and special electrical symbols', async () => {
    const emojiName = '⚡ مولدة النور ⚡ 🔌 (أبو فهد) 🔋';
    const sub = await db.addSubscriber({
      fullName: emojiName,
      phone: '07700000000',
      street: 'الشارع ⚡',
      breakerNumber: 'R-⚡',
      amperes: 5,
      subscriptionType: 'normal',
      openingBalance: 0,
      isActive: true
    });

    assert.equal(sub.fullName, emojiName);
    const found = db.searchSubscribers('النور');
    assert.equal(found.length, 1);
  });

  it('B-DB-4: rejects update on non-existent subscriber ID with descriptive error', async () => {
    await assert.rejects(
      async () => {
        await db.updateSubscriber(999999, { amperes: 10 });
      },
      /Subscriber with id 999999 not found/
    );
  });

  it('B-DB-5: returns false when deleting non-existent subscriber ID without crashing', async () => {
    const deleted = await db.deleteSubscriber(999999);
    assert.equal(deleted, false);
  });

  it('B-DB-6: handles control characters and right-to-left mark (RLM) in addresses', async () => {
    const rlmText = '\u200Fبغداد\t- \u200Eحي الجامعة\r\nزقاق 12';
    const sub = await db.addSubscriber({
      fullName: 'علي الرسام',
      phone: '07800000000',
      street: rlmText,
      breakerNumber: 'R-01',
      amperes: 3,
      subscriptionType: 'normal',
      openingBalance: 0,
      isActive: true
    });

    assert.equal(sub.street, rlmText);
  });
});
