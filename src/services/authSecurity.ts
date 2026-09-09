/**
 * وحدة أمان وتشفير كلمات المرور (Password Security Module)
 * تعتمد على معيار Web Crypto API الأصلي بالمتصفح (SHA-256 مع Salt عشوائي)
 * تعمل بكفاءة عالية في وضع الأوفلاين والأونلاين بدون أي مكتبات خارجية ثقيلة.
 */

// تحويل مصفوفة بايت إلى نص ست عشري (Hex)
function bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// توليد ملح أمني عشوائي (Cryptographic Salt)
function generateSalt(length = 16): string {
  const randomBytes = new Uint8Array(length);
  crypto.getRandomValues(randomBytes);
  return bufferToHex(randomBytes);
}

// حساب الهاش المشفر باستخدام SHA-256
async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return bufferToHex(hashBuffer);
}

const HASH_PREFIX = 'v1$';

/**
 * تجزئة كلمة المرور مع Salt عشوائي فريد
 * الصيغة الناتجة: v1$salt$hash
 */
export async function hashPassword(password: string): Promise<string> {
  const cleanPassword = password.trim();
  const salt = generateSalt(16);
  const hash = await sha256(`${salt}:${cleanPassword}`);
  return `${HASH_PREFIX}${salt}$${hash}`;
}

/**
 * فحص ما إذا كانت القيمة المخزنة مشفرة بالفعل بالصيغة الحديثة
 */
export function isPasswordHashed(storedValue: string): boolean {
  return typeof storedValue === 'string' && storedValue.startsWith(HASH_PREFIX);
}

/**
 * التحقق من صحة كلمة المرور
 * يدعم كلاً من:
 * 1. الصيغة الحديثة المشفرة (v1$salt$hash)
 * 2. الحسابات القديمة المسجلة بنص صريح (لضمان عدم حرمان أي مستخدم من الدخول، مع إمكانية ترقيته تلقائياً)
 */
export async function verifyPassword(password: string, storedValue: string): Promise<boolean> {
  if (!password || !storedValue) return false;
  const cleanPassword = password.trim();

  // 1. إذا كانت القيمة مشفرة بالصيغة الحديثة
  if (isPasswordHashed(storedValue)) {
    const parts = storedValue.split('$');
    if (parts.length !== 3) return false;
    const salt = parts[1];
    const expectedHash = parts[2];
    const calculatedHash = await sha256(`${salt}:${cleanPassword}`);
    return calculatedHash === expectedHash;
  }

  // 2. التوافقية العكسية: فحص النص الصريح للحسابات السابقة قبل الترقية
  return cleanPassword === storedValue.trim();
}
