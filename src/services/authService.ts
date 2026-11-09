/**
 * src/services/authService.ts
 * Local authentication for the Super Admin dashboard.
 *
 * Passwords are never stored in plain text: PBKDF2-SHA256 (210k iterations)
 * with a random per-user salt. The session lives in sessionStorage and expires
 * automatically. Failed attempts are throttled per username.
 *
 * This is a local, offline-first application. It is not a replacement for a
 * server-side identity provider, but it prevents casual access to the admin
 * cockpit on a shared device.
 */

import { db } from '../db/database.ts';
import type { AuthUser } from '../types/index.ts';
import { constantTimeEqual } from '../utils/security.ts';

const SESSION_KEY = 'ampereji_admin_session_v1';
const LOCKOUT_KEY = 'ampereji_auth_lockout_v1';

const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'power';

const PBKDF2_ITERATIONS = 210_000;
const PBKDF2_HASH = 'SHA-256';
const SALT_BYTES = 16;
const HASH_BYTES = 32;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;
const LOCKOUT_RECORD_TTL_MS = 24 * 60 * 60 * 1000;

interface StoredSession {
  userId: string;
  username: string;
  role: 'super_admin' | 'tenant_owner';
  tenantId: string | null;
  expiresAt: number;
  usedDefaultPassword: boolean;
}

interface LockoutEntry {
  failures: number;
  lockedUntil: number;
  lastFailure: number;
}

type LockoutMap = Record<string, LockoutEntry>;

export interface AuthSession {
  userId: string;
  username: string;
  role: 'super_admin' | 'tenant_owner';
  tenantId: string | null;
  expiresAt: number;
  usedDefaultPassword: boolean;
}

export interface LoginResult {
  success: boolean;
  error?: string;
  user?: AuthUser;
  usedDefaultPassword?: boolean;
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function bytesFromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function getCrypto(): Crypto {
  const webCrypto = globalThis.crypto;
  if (!webCrypto?.subtle) {
    throw new Error('التشفير غير متاح في هذا المتصفح. افتح التطبيق عبر HTTPS أو localhost.');
  }
  return webCrypto;
}

async function derivePasswordHash(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const webCrypto = getCrypto();
  const keyMaterial = await webCrypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await webCrypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as any, iterations, hash: PBKDF2_HASH },
    keyMaterial,
    HASH_BYTES * 8
  );
  return base64FromBytes(new Uint8Array(bits));
}

function packageHash(hashBase64: string, iterations: number): string {
  return `pbkdf2-sha256$${iterations}$${hashBase64}`;
}

function unpackHash(stored: string): { hash: string; iterations: number } {
  const parts = (stored || '').split('$');
  if (parts.length === 3 && parts[0] === 'pbkdf2-sha256') {
    const iterations = Number(parts[1]);
    return {
      hash: parts[2],
      iterations: Number.isFinite(iterations) && iterations > 0 ? iterations : PBKDF2_ITERATIONS,
    };
  }
  // Compatibility with any plain-hash row created by early builds.
  return { hash: stored, iterations: PBKDF2_ITERATIONS };
}

export class AuthService {
  private bootstrapPromise: Promise<void> | null = null;
  private memorySession: StoredSession | null = null;

  /**
   * Create the first Super Admin on a fresh installation. Existing accounts are
   * never overwritten or reset. Default credentials: admin / power.
   */
  public async ensureDefaultAdmin(): Promise<{ created: boolean }> {
    if (this.bootstrapPromise) {
      await this.bootstrapPromise;
      return { created: false };
    }

    let created = false;
    this.bootstrapPromise = (async () => {
      const adminCount = await db.countAuthUsers('super_admin');
      if (adminCount > 0) return;

      const existing = await db.getAuthUserByUsername(DEFAULT_ADMIN_USERNAME);
      if (existing) {
        // An account with the reserved username exists but is not an admin.
        // Do not silently promote it; the operator must resolve the conflict.
        console.warn('[Auth] Username "admin" exists without a Super Admin. Manual recovery required.');
        return;
      }

      const salt = getCrypto().getRandomValues(new Uint8Array(SALT_BYTES));
      const hash = await derivePasswordHash(DEFAULT_ADMIN_PASSWORD, salt, PBKDF2_ITERATIONS);
      await db.createAuthUser({
        username: DEFAULT_ADMIN_USERNAME,
        passwordHash: packageHash(hash, PBKDF2_ITERATIONS),
        salt: base64FromBytes(salt),
        role: 'super_admin',
        tenantId: null,
      });
      created = true;
      console.info('[Auth] Default Super Admin created (admin). Change the password after first login.');
    })();

    try {
      await this.bootstrapPromise;
    } finally {
      this.bootstrapPromise = null;
    }
    return { created };
  }

  /** Authenticate a username/password pair. */
  public async login(username: string, password: string): Promise<LoginResult> {
    const cleanUsername = (username || '').trim();
    if (!cleanUsername || !password) {
      return { success: false, error: 'يرجى إدخال اسم المستخدم وكلمة المرور' };
    }

    const lock = this.getLockout(cleanUsername);
    if (lock.lockedUntil > Date.now()) {
      const minutes = Math.max(1, Math.ceil((lock.lockedUntil - Date.now()) / 60000));
      return { success: false, error: `تم قفل المحاولات مؤقتاً. حاول مجدداً بعد ${minutes} دقيقة.` };
    }

    const user = await db.getAuthUserByUsername(cleanUsername);

    if (!user) {
      // Perform a real PBKDF2 derivation anyway so response time does not
      // reveal whether the username exists.
      const dummySalt = new Uint8Array(SALT_BYTES);
      const dummy = await derivePasswordHash(password, dummySalt, PBKDF2_ITERATIONS);
      constantTimeEqual(dummy, dummy);
      return this.recordFailure(cleanUsername, 'بيانات الدخول غير صحيحة');
    }

    if (!user.isActive) {
      return this.recordFailure(cleanUsername, 'هذا الحساب موقوف. راجع إدارة المنصة.');
    }

    const salt = bytesFromBase64(user.salt || '');
    const packed = unpackHash(user.passwordHash);
    const derived = await derivePasswordHash(password, salt, packed.iterations);

    if (!constantTimeEqual(derived, packed.hash)) {
      return this.recordFailure(cleanUsername, 'بيانات الدخول غير صحيحة');
    }

    this.clearLockout(cleanUsername);
    await db.touchAuthUserLogin(user.id);

    const usedDefaultPassword =
      user.username.toLowerCase() === DEFAULT_ADMIN_USERNAME && password === DEFAULT_ADMIN_PASSWORD;

    const session: StoredSession = {
      userId: user.id,
      username: user.username,
      role: user.role,
      tenantId: user.tenantId,
      expiresAt: Date.now() + SESSION_TTL_MS,
      usedDefaultPassword,
    };
    this.writeSession(session);
    this.dispatchAuthChanged();

    return {
      success: true,
      user: { ...user },
      usedDefaultPassword,
    };
  }

  /** Login restricted to the platform owner. */
  public async loginAdmin(username: string, password: string): Promise<LoginResult> {
    const result = await this.login(username, password);
    if (!result.success) return result;

    if (result.user?.role !== 'super_admin') {
      this.logout();
      return { success: false, error: 'هذا الحساب لا يملك صلاحية الدخول إلى لوحة الإدارة' };
    }
    return result;
  }

  public getSession(): AuthSession | null {
    const stored = this.readSession();
    if (!stored) return null;

    if (stored.expiresAt <= Date.now()) {
      this.clearSession();
      return null;
    }

    return {
      userId: stored.userId,
      username: stored.username,
      role: stored.role,
      tenantId: stored.tenantId,
      expiresAt: stored.expiresAt,
      usedDefaultPassword: Boolean(stored.usedDefaultPassword),
    };
  }

  public isSuperAdmin(): boolean {
    return this.getSession()?.role === 'super_admin';
  }

  /**
   * Ensure the cached session still maps to an active user in the current
   * database (especially important after restoring a backup).
   */
  public async validateSession(): Promise<AuthSession | null> {
    const session = this.getSession();
    if (!session) return null;

    try {
      const user = await db.getAuthUserByUsername(session.username);
      if (!user || !user.isActive || user.id !== session.userId || user.role !== session.role) {
        this.clearSession();
        return null;
      }
      return session;
    } catch (_) {
      this.clearSession();
      return null;
    }
  }

  public logout(): void {
    this.clearSession();
    this.dispatchAuthChanged();
  }

  /**
   * Change the signed-in admin password after verifying the current one.
   * Returns an Arabic error message when validation fails.
   */
  public async changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    const session = this.getSession();
    if (!session) return { success: false, error: 'انتهت جلسة الإدارة. يرجى تسجيل الدخول مجدداً.' };

    if (!currentPassword) return { success: false, error: 'يرجى إدخال كلمة المرور الحالية' };
    if (newPassword.length < 8) return { success: false, error: 'كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل' };
    if (newPassword === DEFAULT_ADMIN_PASSWORD) {
      return { success: false, error: 'لا يمكن استخدام كلمة المرور الافتراضية. اختر كلمة مرور أقوى.' };
    }
    if (newPassword === currentPassword) {
      return { success: false, error: 'كلمة المرور الجديدة يجب أن تختلف عن الحالية' };
    }

    const user = await db.getAuthUserByUsername(session.username);
    if (!user) return { success: false, error: 'تعذر العثور على حساب الإدارة' };

    const packed = unpackHash(user.passwordHash);
    const currentDerived = await derivePasswordHash(
      currentPassword,
      bytesFromBase64(user.salt || ''),
      packed.iterations
    );
    if (!constantTimeEqual(currentDerived, packed.hash)) {
      return { success: false, error: 'كلمة المرور الحالية غير صحيحة' };
    }

    const salt = getCrypto().getRandomValues(new Uint8Array(SALT_BYTES));
    const hash = await derivePasswordHash(newPassword, salt, PBKDF2_ITERATIONS);
    await db.updateAuthUserPassword(user.id, packageHash(hash, PBKDF2_ITERATIONS), base64FromBytes(salt));

    const stored = this.readSession();
    if (stored) {
      stored.usedDefaultPassword = false;
      this.writeSession(stored);
    }
    this.dispatchAuthChanged();
    return { success: true };
  }

  public isUsingDefaultPassword(): boolean {
    return Boolean(this.getSession()?.usedDefaultPassword);
  }

  /* ----------------------------------------------------
   * SESSION STORAGE (sessionStorage with in-memory fallback)
   * ---------------------------------------------------- */

  private readSession(): StoredSession | null {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return this.memorySession;
      const parsed = JSON.parse(raw) as StoredSession;
      if (!parsed || typeof parsed.userId !== 'string' || typeof parsed.expiresAt !== 'number') {
        return null;
      }
      return parsed;
    } catch (_) {
      return this.memorySession;
    }
  }

  private writeSession(session: StoredSession): void {
    this.memorySession = session;
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch (_) {}
  }

  private clearSession(): void {
    this.memorySession = null;
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (_) {}
  }

  /* ----------------------------------------------------
   * FAILED ATTEMPT THROTTLING
   * ---------------------------------------------------- */

  private getLockout(username: string): LockoutEntry {
    const key = username.toLowerCase();
    const map = this.readLockoutMap();
    const entry = map[key];
    if (!entry) return { failures: 0, lockedUntil: 0, lastFailure: 0 };
    if (Date.now() - (entry.lastFailure || 0) > LOCKOUT_RECORD_TTL_MS && entry.lockedUntil <= Date.now()) {
      delete map[key];
      this.writeLockoutMap(map);
      return { failures: 0, lockedUntil: 0, lastFailure: 0 };
    }
    return entry;
  }

  private recordFailure(username: string, message: string): LoginResult {
    const key = username.toLowerCase();
    const map = this.readLockoutMap();
    const entry = map[key] || { failures: 0, lockedUntil: 0, lastFailure: 0 };
    const failures = Math.min(MAX_FAILED_ATTEMPTS, entry.failures + 1);
    const lockedUntil = failures >= MAX_FAILED_ATTEMPTS ? Date.now() + LOCKOUT_MS : 0;
    map[key] = { failures, lockedUntil, lastFailure: Date.now() };
    this.writeLockoutMap(map);

    if (lockedUntil) {
      return { success: false, error: 'تم قفل المحاولات لمدة 5 دقائق بسبب تكرار كلمة المرور الخاطئة.' };
    }
    const remaining = MAX_FAILED_ATTEMPTS - failures;
    return { success: false, error: `${message}. المحاولات المتبقية: ${remaining}` };
  }

  private clearLockout(username: string): void {
    const key = username.toLowerCase();
    const map = this.readLockoutMap();
    if (map[key]) {
      delete map[key];
      this.writeLockoutMap(map);
    }
  }

  private readLockoutMap(): LockoutMap {
    try {
      const raw = localStorage.getItem(LOCKOUT_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as LockoutMap;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  private writeLockoutMap(map: LockoutMap): void {
    try {
      localStorage.setItem(LOCKOUT_KEY, JSON.stringify(map));
    } catch (_) {}
  }

  private dispatchAuthChanged(): void {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ampereji:auth-changed'));
    }
  }
}

export const authService = new AuthService();
export { DEFAULT_ADMIN_USERNAME };
