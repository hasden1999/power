import { useState, type FC, type FormEvent } from 'react';
import { db } from '../db/db';
import { supabase } from '../services/supabaseClient';
import { hashPassword, verifyPassword, isPasswordHashed } from '../services/authSecurity';
import type { UserAccount, TenantSettings } from '../types';
import { Zap, Lock, Phone, User, Building, MapPin, CheckCircle2, ShieldCheck, ArrowLeft } from 'lucide-react';

interface AuthScreenProps {
  onLoginSuccess: (user: UserAccount, tenant?: TenantSettings) => void;
}

export const AuthScreen: FC<AuthScreenProps> = ({ onLoginSuccess }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');

  // حقول تسجيل الدخول
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // حقول تسجيل مولدة جديدة حقيقية
  const [regGenName, setRegGenName] = useState('');
  const [regOwnerName, setRegOwnerName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regCity, setRegCity] = useState('بغداد');
  const [regAddress, setRegAddress] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regPlan, setRegPlan] = useState<'monthly' | 'yearly'>('monthly');
  const [regSuccess, setRegSuccess] = useState(false);

  // معالجة تسجيل الدخول الحقيقي
  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const usernameClean = loginUsername.trim();
      const passwordClean = loginPassword.trim();

      // 1. الفحص من سحابة Supabase أولاً
      if (navigator.onLine) {
        const { data: cloudUser } = await supabase
          .from('users')
          .select('*')
          .eq('username', usernameClean)
          .maybeSingle();

        if (cloudUser) {
          const isValid = await verifyPassword(passwordClean, cloudUser.password);
          if (isValid) {
            let activePassword = cloudUser.password;
            // ترقية أمنية تلقائية لكلمة المرور إذا كانت مسجلة بالنص الصريح القديم
            if (!isPasswordHashed(cloudUser.password)) {
              try {
                activePassword = await hashPassword(passwordClean);
                await supabase
                  .from('users')
                  .update({ password: activePassword })
                  .eq('id', cloudUser.id);
              } catch (upgErr) {
                console.warn('تعذر ترقية كلمة المرور في السحابة حالياً:', upgErr);
              }
            }

            const appUser: UserAccount = {
              id: cloudUser.id,
              username: cloudUser.username,
              password: activePassword,
              fullName: cloudUser.full_name,
              role: cloudUser.role,
              tenantId: cloudUser.tenant_id || undefined,
              createdAt: cloudUser.created_at,
            };
            await db.users.put(appUser);

            let appTenant: TenantSettings | undefined;
            if (cloudUser.tenant_id) {
              const { data: cloudTenant } = await supabase
                .from('tenants')
                .select('*')
                .eq('id', cloudUser.tenant_id)
                .maybeSingle();

              if (cloudTenant) {
                appTenant = {
                  id: cloudTenant.id,
                  generatorName: cloudTenant.generator_name,
                  ownerName: cloudTenant.owner_name,
                  phone: cloudTenant.phone || '',
                  address: cloudTenant.address || '',
                  plan: cloudTenant.plan || 'monthly',
                  planPrice: Number(cloudTenant.plan_price) || 0,
                  subscriptionStatus: cloudTenant.subscription_status || 'active',
                  isBlocked: Boolean(cloudTenant.is_blocked),
                  expiresAt: cloudTenant.expires_at,
                  autoSendWhatsapp: Boolean(cloudTenant.auto_send_whatsapp),
                  defaultPriceNormal: Number(cloudTenant.default_price_normal) || 0,
                  defaultPriceGold: Number(cloudTenant.default_price_gold) || 0,
                  createdAt: cloudTenant.created_at,
                };
                await db.settings.put(appTenant);
              }
            }

            onLoginSuccess(appUser, appTenant);
            return;
          }
        }
      }

      // 2. الفحص محلياً من IndexedDB إذا كان أوفلاين أو تعذر الوصول للسحابة
      const localUser = await db.users
        .where('username')
        .equals(usernameClean)
        .first();

      if (localUser) {
        const isLocalValid = await verifyPassword(passwordClean, localUser.password);
        if (isLocalValid) {
          // ترقية كلمة المرور المحلية إذا كانت غير مشفرة
          if (!isPasswordHashed(localUser.password)) {
            try {
              const hashedLocal = await hashPassword(passwordClean);
              await db.users.update(localUser.id, { password: hashedLocal });
              localUser.password = hashedLocal;
            } catch (localUpgErr) {
              console.warn('تعذر ترقية كلمة المرور محلياً:', localUpgErr);
            }
          }

          const localTenant = localUser.tenantId
            ? await db.settings.get(localUser.tenantId)
            : undefined;
          onLoginSuccess(localUser, localTenant);
          return;
        }
      }

      setErrorMessage('رقم الهاتف / اسم المستخدم أو كلمة المرور غير صحيحة');
    } catch (err) {
      console.error('خطأ في تسجيل الدخول:', err);
      setErrorMessage('حدث خطأ في الاتصال، يرجى المحاولة مرة أخرى.');
    } finally {
      setIsLoading(false);
    }
  };

  // معالجة تسجيل مولدة جديدة حقيقية
  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!regGenName.trim() || !regPhone.trim() || !regPassword.trim()) {
      setErrorMessage('يرجى ملء جميع الحقول المطلوبة (اسم المولدة، رقم الهاتف، كلمة المرور)');
      return;
    }

    if (regPassword.trim().length < 6) {
      setErrorMessage('يجب أن لا تقل كلمة المرور عن 6 أحرف أو أرقام');
      return;
    }

    setIsLoading(true);

    try {
      const phoneClean = regPhone.trim();

      // التحقق من عدم تكرار رقم الهاتف في السحابة
      if (navigator.onLine) {
        const { data: existingUser } = await supabase
          .from('users')
          .select('id')
          .eq('username', phoneClean)
          .maybeSingle();

        if (existingUser) {
          setErrorMessage('رقم الهاتف هذا مسجل مسبقاً في النظام. يرجى تسجيل الدخول بدلاً من ذلك.');
          setIsLoading(false);
          return;
        }
      }

      const newTenantId = `tenant-${Date.now()}`;
      const newUserId = `user-${Date.now()}`;

      // تفعيل فترة تجريبية مجانية لمدة 7 أيام عند التسجيل الجديد
      const trialDays = 7;
      const trialExpiresAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString();

      const newTenant: TenantSettings = {
        id: newTenantId,
        generatorName: regGenName.trim(),
        ownerName: regOwnerName.trim() || regGenName.trim(),
        phone: phoneClean,
        address: `${regCity} - ${regAddress.trim() || 'العراق'}`,
        plan: 'trial',
        planPrice: 0,
        subscriptionStatus: 'trial', // فترة تجريبية نشطة ومفتوحة لمدة 7 أيام
        isBlocked: false,
        expiresAt: trialExpiresAt,
        autoSendWhatsapp: true,
        defaultPriceNormal: 12000,
        defaultPriceGold: 20000,
        createdAt: new Date().toISOString(),
      };

      const hashedPassword = await hashPassword(regPassword.trim());

      const newUser: UserAccount = {
        id: newUserId,
        username: phoneClean,
        password: hashedPassword,
        fullName: regOwnerName.trim() || regGenName.trim(),
        role: 'tenant_owner',
        tenantId: newTenantId,
        createdAt: new Date().toISOString(),
      };

      // الحفظ في سحابة Supabase أولاً
      if (navigator.onLine) {
        await supabase.from('tenants').insert({
          id: newTenant.id,
          generator_name: newTenant.generatorName,
          owner_name: newTenant.ownerName,
          phone: newTenant.phone,
          address: newTenant.address,
          plan: newTenant.plan,
          plan_price: newTenant.planPrice,
          subscription_status: newTenant.subscriptionStatus,
          is_blocked: newTenant.isBlocked,
          expires_at: newTenant.expiresAt,
          auto_send_whatsapp: newTenant.autoSendWhatsapp,
          default_price_normal: newTenant.defaultPriceNormal,
          default_price_gold: newTenant.defaultPriceGold,
          created_at: newTenant.createdAt,
        });

        await supabase.from('users').insert({
          id: newUser.id,
          username: newUser.username,
          password: newUser.password,
          full_name: newUser.fullName,
          role: newUser.role,
          tenant_id: newUser.tenantId,
          created_at: newUser.createdAt,
        });
      }

      // الحفظ في قاعدة البيانات المحلية (IndexedDB)
      await db.settings.put(newTenant);
      await db.users.put(newUser);

      setRegSuccess(true);
      setTimeout(() => {
        onLoginSuccess(newUser, newTenant);
      }, 1500);
    } catch (err) {
      console.error('خطأ في تسجيل المولدة:', err);
      setErrorMessage('حدث خطأ أثناء حفظ البيانات، يرجى المحاولة مرة أخرى.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 selection:bg-amber-500 selection:text-slate-950 font-sans"
    >
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        {/* خلفية جمالية */}
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>

        {/* الشعار والعنوان الرئيسي */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 mx-auto shadow-lg shadow-amber-500/10 mb-3">
            <Zap className="w-8 h-8 fill-amber-400" />
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            منظومة المولدات الأهلية
          </h2>
          <p className="text-xs text-slate-400 mt-1 font-medium">
            المنصة السحابية الموحدة لإدارة وجباية المولدات في العراق
          </p>
        </div>

        {/* رسائل التنبيه والخطأ */}
        {errorMessage && (
          <div className="mb-4 p-3 bg-rose-950/60 border border-rose-500/40 rounded-xl text-xs text-rose-300 animate-shake flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-500 flex-shrink-0"></span>
            <span>{errorMessage}</span>
          </div>
        )}

        {regSuccess && (
          <div className="mb-4 p-3.5 bg-emerald-950/70 border border-emerald-500/40 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <span>تم تسجيل مولدتكم وتفعيل الفترة التجريبية (7 أيام) بنجاح! جاري الدخول...</span>
          </div>
        )}

        {/* تبويبات التبديل: تسجيل الدخول / تسجيل مولدة جديدة */}
        <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 rounded-2xl border border-slate-800 mb-6">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setErrorMessage(null);
            }}
            className={`py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              mode === 'login'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-black'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            تسجيل الدخول
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setErrorMessage(null);
            }}
            className={`py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              mode === 'register'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-black'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            تسجيل مولدة جديدة
          </button>
        </div>

        {/* 1. نموذج تسجيل الدخول */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-amber-400" />
                <span>رقم الهاتف أو اسم المستخدم</span>
              </label>
              <input
                type="text"
                required
                placeholder="أدخل رقم الهاتف أو اسم المستخدم"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>كلمة المرور</span>
              </label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-3 rounded-xl text-sm transition-all shadow-lg shadow-amber-500/20 mt-2 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <span>{isLoading ? 'جاري التحقق والدخول...' : 'تسجيل الدخول للنظام'}</span>
              <ArrowLeft className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* 2. نموذج تسجيل مولدة جديدة حقيقي */}
        {mode === 'register' && (
          <form onSubmit={handleRegister} className="space-y-3">
            {/* إشعار الفترة التجريبية المجانية 7 أيام */}
            <div className="bg-gradient-to-r from-emerald-950/80 to-slate-900 border border-emerald-500/40 rounded-2xl p-3 text-emerald-300 text-xs flex items-center gap-2.5 shadow-md">
              <span className="text-xl">🎁</span>
              <div>
                <strong className="block text-emerald-400 font-bold">فترة تجريبية مجانية لمدة 7 أيام!</strong>
                <span className="text-[11px] text-emerald-200/80">
                  سجل الآن واستخدم المنظومة بكافة مميزاتها مجاناً. المطالبة بالاشتراك تبدأ بعد انتهاء الـ 7 أيام.
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-amber-400" />
                <span>اسم المولدة *</span>
              </label>
              <input
                type="text"
                required
                placeholder="مثال: مولدة السلام الأهلية"
                value={regGenName}
                onChange={(e) => setRegGenName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-amber-400" />
                  <span>اسم صاحب المولدة</span>
                </label>
                <input
                  type="text"
                  placeholder="مثال: أبو سجاد"
                  value={regOwnerName}
                  onChange={(e) => setRegOwnerName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-amber-400" />
                  <span>رقم الهاتف (للدخول) *</span>
                </label>
                <input
                  type="tel"
                  required
                  placeholder="0770xxxxxxx"
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-amber-400" />
                  <span>المحافظة</span>
                </label>
                <select
                  value={regCity}
                  onChange={(e) => setRegCity(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="بغداد">بغداد</option>
                  <option value="البصرة">البصرة</option>
                  <option value="النجف">النجف</option>
                  <option value="كربلاء">كربلاء</option>
                  <option value="بابل">بابل</option>
                  <option value="أربيل">أربيل</option>
                  <option value="نينوى">نينوى</option>
                  <option value="كركوك">كركوك</option>
                  <option value="ميسان">ميسان</option>
                  <option value="ذي قار">ذي قار</option>
                  <option value="الديوانية">الديوانية</option>
                  <option value="ديالى">ديالى</option>
                  <option value="الأنبار">الأنبار</option>
                  <option value="واسط">واسط</option>
                  <option value="المثنى">المثنى</option>
                  <option value="صلاح الدين">صلاح الدين</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-amber-400" />
                  <span>المنطقة / الشارع</span>
                </label>
                <input
                  type="text"
                  placeholder="مثال: الكرادة - محلة 903"
                  value={regAddress}
                  onChange={(e) => setRegAddress(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>كلمة المرور للدخول مستقبلاً *</span>
              </label>
              <input
                type="password"
                required
                placeholder="6 أحرف أو أرقام على الأقل"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>

            {/* اختيار باقة الاشتراك المطلوبة */}
            <div className="pt-1">
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                باقة الاشتراك المطلوبة (بعد انتهاء الـ 7 أيام التجريبية المجانية):
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <label
                  className={`p-2.5 rounded-xl border cursor-pointer flex flex-col justify-between transition-all ${
                    regPlan === 'monthly'
                      ? 'bg-amber-500/10 border-amber-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold">شهري</span>
                    <input
                      type="radio"
                      name="plan"
                      checked={regPlan === 'monthly'}
                      onChange={() => setRegPlan('monthly')}
                      className="accent-amber-500"
                    />
                  </div>
                  <strong className="text-amber-400 text-sm mt-1">15,000 د.ع</strong>
                </label>

                <label
                  className={`p-2.5 rounded-xl border cursor-pointer flex flex-col justify-between transition-all ${
                    regPlan === 'yearly'
                      ? 'bg-amber-500/10 border-amber-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-emerald-400">سنوي (خصم شهرين)</span>
                    <input
                      type="radio"
                      name="plan"
                      checked={regPlan === 'yearly'}
                      onChange={() => setRegPlan('yearly')}
                      className="accent-amber-500"
                    />
                  </div>
                  <strong className="text-amber-400 text-sm mt-1">150,000 د.ع</strong>
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black py-3 rounded-xl text-sm transition-all shadow-lg shadow-amber-500/20 mt-2 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{isLoading ? 'جاري إنشاء الحساب وتفعيل التجربة...' : 'تسجيل المولدة وبدء التجربة المجانية (7 أيام)'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
