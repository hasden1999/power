/**
 * tools/generate-license.js
 * CLI Utility to generate ECDSA key pairs and issue signed offline licenses
 * Pure Node.js built-in crypto — Zero dependencies
 *
 * Usage:
 *   node tools/generate-license.js generate-keys
 *   node tools/generate-license.js issue --name "مولدة القدس الأهلية" --phone "07701234567" --days 365
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const KEYS_FILE = path.join(__dirname, 'license-keys.json');

// Command: Generate Keys
function generateKeys() {
  console.log('Generating ECDSA P-256 key pair for offline licensing...');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'P-256',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const jwkPublic = crypto.createPublicKey(publicKey).export({ format: 'jwk' });
  const keysData = {
    publicKeyPem: publicKey,
    privateKeyPem: privateKey,
    publicJwk: jwkPublic,
    createdAt: new Date().toISOString(),
  };

  fs.writeFileSync(KEYS_FILE, JSON.stringify(keysData, null, 2), 'utf-8');
  console.log(` Keys successfully saved to: ${KEYS_FILE}`);
  console.log('\n=== Embed this public JWK into src/license/license.ts ===\n');
  console.log(JSON.stringify(jwkPublic, null, 2));
}

// Command: Issue License
function issueLicense(generatorName, ownerPhone, validDays = 365, licenseType = 'yearly') {
  if (!fs.existsSync(KEYS_FILE)) {
    console.error(' Keys file not found! Run: node tools/generate-license.js generate-keys');
    process.exit(1);
  }

  const keys = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf-8'));
  const now = new Date();
  const expiresAt = validDays > 0 ? new Date(now.getTime() + validDays * 24 * 60 * 60 * 1000).toISOString() : null;

  const payload = {
    generatorName: generatorName || 'المولدة الأهلية',
    ownerPhone: ownerPhone || '',
    issuedAt: now.toISOString(),
    expiresAt,
    licenseType,
    system: 'ampereji',
    version: '1.0',
  };

  const payloadJson = JSON.stringify(payload);
  const payloadBase64 = Buffer.from(payloadJson, 'utf-8').toString('base64url');

  // Sign payload using crypto.sign with IEEE P1363 (standard 64-byte raw signature)
  const privateKeyObj = crypto.createPrivateKey(keys.privateKeyPem);
  const sigBuffer = crypto.sign(
    'SHA256',
    Buffer.from(payloadBase64, 'utf-8'),
    { key: privateKeyObj, dsaEncoding: 'ieee-p1363' }
  );

  const signatureBase64 = sigBuffer.toString('base64url');
  const licenseKey = `AMPEREJI-${payloadBase64}.${signatureBase64}`;

  console.log('\n========================================');
  console.log('  كود ترخيص منظومة أمبيرجي الموقّع رقمياً ');
  console.log('========================================\n');
  console.log(`اسم المولدة : ${payload.generatorName}`);
  console.log(`رقم الهاتف : ${payload.ownerPhone}`);
  console.log(`تاريخ الإصدار: ${payload.issuedAt}`);
  console.log(`تاريخ الانتهاء: ${payload.expiresAt || 'مدى الحياة (دائم)'}`);
  console.log('\n--- كود الترخيص المعتمد ---\n');
  console.log(licenseKey);
  console.log('\n========================================\n');
  return licenseKey;
}

// Parse CLI args
const args = process.argv.slice(2);
const command = args[0];

if (command === 'generate-keys') {
  generateKeys();
} else if (command === 'issue') {
  let name = 'مولدة حي السلام الأهلية';
  let phone = '07701234567';
  let days = 365;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--name' && args[i + 1]) name = args[i + 1];
    if (args[i] === '--phone' && args[i + 1]) phone = args[i + 1];
    if (args[i] === '--days' && args[i + 1]) days = parseInt(args[i + 1], 10);
  }

  issueLicense(name, phone, days);
} else {
  console.log(`
استخدام سكربت إصدار التراخيص لمنظومة أمبيرجي:

1. توليد زوج المفاتيح (مرة واحدة):
   node tools/generate-license.js generate-keys

2. إصدار كود ترخيص لمولدة معينة:
   node tools/generate-license.js issue --name "مولدة النور" --phone "07700000000" --days 365
`);
}
