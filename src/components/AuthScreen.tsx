import { useState, type FC, type FormEvent } from 'react';
import { db } from '../db/db';
import type { UserAccount, TenantSettings } from '../types';
import { Zap, ShieldCheck, Lock, User, Building, ArrowRight, CheckCircle2 } from 'lucide-react';




interface AuthScreenProps {
  onLoginSuccess: (user: UserAccount, tenant?: TenantSettings) => void;
}

export const AuthScreen: FC<AuthScreenProps> = ({ onLoginSuccess }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  
  // حقول تسجيل الدخول
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // حقول تسجيل مولدة جديدة
  const [regGenName, setRegGenName] = useState('');
  const [regOwnerName, setRegOwnerName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regCity, setRegCity] = useState('بغداد');
  const [regAddress, setRegAddress] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regSuccess, setRegSuccess] = useState(false);

  // معالجة تسجيل الدخول
  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const user = await db.users
      .where('username')
      .equals(loginUsername.trim())
      .first();

    if (!user || user.password !== loginPassword.trim()) {
      setErrorMessage('رقم الهاتف / اسم المستخدم أو كلمة المرور غير صحيحة');
      return;
    }

    let tenant: TenantSettings | undefined;
    if (user.tenantId) {
      tenant = await db.settings.get(user.tenantId);
      if (tenant?.isBlocked) {
        setErrorMessage('هذا الحساب موقوف من قبل إدارة المنصة. يرجى التواصل مع الدعم الفني.');
        return;
      }
    }

    onLoginSuccess(user, tenant);
  };

  // الدخول التجريبي السريع بنقرة واحدة
  const handleQuickDemo = async (type: 'admin' | 'baghdad' | 'basra') => {
    setErrorMessage(null);
    let targetUsername = 'admin';
    if (type === 'baghdad') targetUsername = '07701234567';
    if (type === 'basra') targetUsername = '07801234567';

    const user = await db.users.where('username').equals(targetUsername).first();
    if (user) {
      const tenant = user.tenantId ? await db.settings.get(user.tenantId) : undefined;
      onLoginSuccess(user, tenant);
    }
  };

  // معالجة تسجيل مولدة جديدة
  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    if (!regGenName.trim() || !regPhone.trim() || !regPassword.trim()) {
      setErrorMessage('يرجى ملء جميع الحقول الإلزامية');
      return;
    }

    // التحقق من عدم تكرار رقم الهاتف
    const existing = await db.users.where('username').equals(regPhone.trim()).first();
    if (existing) {
      setErrorMessage('رقم الهاتف هذا مسجل مسبقاً في النظام');
      return;
    }

    const newTenantId = `tenant-${Date.now()}`;
    const newTenant: TenantSettings = {
      id: newTenantId,
      generatorName: regGenName.trim(),
      ownerName: regOwnerName.trim() || 'صاحب المولدة',
      phone: regPhone.trim(),
      address: `${regCity} - ${regAddress.trim()}`,
      plan: 'trial',
      planPrice: 0,
      subscriptionStatus: 'active',
      isBlocked: false,
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 14 يوم تجريبي
      autoSendWhatsapp: true,
      defaultPriceNormal: 12000,
      defaultPriceGold: 20000,
      createdAt: new Date().toISOString(),
    };

    const newUser: UserAccount = {
      id: `user-${Date.now()}`,
      username: regPhone.trim(),
      password: regPassword.trim(),
      fullName: regOwnerName.trim() || regGenName.trim(),
      role: 'tenant_owner',
      tenantId: newTenantId,
      createdAt: new Date().toISOString(),
    };

    await db.settings.put(newTenant);
    await db.users.put(newUser);

    setRegSuccess(true);
    setTimeout(() => {
      onLoginSuccess(newUser, newTenant);
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 selection:bg-amber-500 selection:text-slate-950">
      
      {/* بطاقة المصادقة */}
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        
        {/* خلفية جمالية */}
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>

        {/* الشعار والعنوان */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 mx-auto shadow-lg shadow-amber-500/10 mb-3">
            <Zap className="w-8 h-8 fill-amber-400" />
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            منظومة المولدات الأهلية (SaaS)
          </h2>
          <p className="text-xs text-slate-400 mt-1 font-medium">
            المنصة السحابية الموحدة لإدارة وجباية المولدات في العراق
          </p>
        </div>

        {/* زر الدخول المجاني الفوري بنقرة واحدة */}
        <div className="mb-5 bg-gradient-to-r from-emerald-950/80 to-slate-900 border-2 border-emerald-500/50 rounded-2xl p-3.5 text-center shadow-lg shadow-emerald-500/10">
          <span className="text-xs text-emerald-400 font-bold block mb-1.5 flex items-center justify-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
            هل تريد تجربة النظام مجاناً الآن فوراً؟
          </span>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <button
              type="button"
              onClick={() => handleQuickDemo('baghdad')}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-black py-2.5 px-3 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/30 cursor-pointer"
            >
              <Zap className="w-4 h-4 fill-white" />
              <span>دخول مجاني (صاحب مولدة)</span>
            </button>
            <button
              type="button"
              onClick={() => handleQuickDemo('admin')}
              className="bg-purple-600 hover:bg-purple-500 text-white font-black py-2.5 px-3 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 shadow-md shadow-purple-600/30 cursor-pointer"
            >
              <span>دخول مجاني (صاحب المنصة)</span>
            </button>
          </div>
          <span className="text-[10px] text-slate-400 block mt-2">
            ✓ بدون كلمة سر ✓ بدون دفع مسبق ✓ بيانات ومشتركين جاهزين للمعاينة
          </span>
        </div>

        {/* تبويبات التبديل بين الدخول والتسجيل */}
        <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 rounded-2xl border border-slate-800 mb-6">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setErrorMessage(null);
            }}
            className={`py-2 text-xs font-bold rounded-xl transition-all ${
              mode === 'login'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            تسجيل الدخول برقم الهاتف
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setErrorMessage(null);
            }}
            className={`py-2 text-xs font-bold rounded-xl transition-all ${
              mode === 'register'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            تسجيل مولدة جديدة (مجاناً 100%)
          </button>
        </div>


        {/* رسائل الخطأ والنجاح */}
        {errorMessage && (
          <div className="mb-4 bg-rose-500/10 border border-rose-500/30 text-rose-400 p-3 rounded-xl text-xs font-medium">
            {errorMessage}
          </div>
        )}

        {regSuccess && (
          <div className="mb-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-3 rounded-xl text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>تم إنشاء حساب المولدة بنجاح وتفعيل التجربة المجانية 14 يوماً!</span>
          </div>
        )}

        {/* نموذج تسجيل الدخول */}
        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                رقم الهاتف أو اسم المستخدم
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="مثال: 07701234567 أو admin"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pr-10 pl-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                />
                <User className="w-4 h-4 text-slate-500 absolute right-3.5 top-3.5" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                كلمة المرور
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pr-10 pl-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                />
                <Lock className="w-4 h-4 text-slate-500 absolute right-3.5 top-3.5" />
              </div>
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-3 rounded-xl shadow-lg shadow-amber-500/20 text-sm transition-all cursor-pointer transform active:scale-98"
            >
              <span>دخول إلى النظام</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            {/* أزرار الدخول التجريبي السريع */}
            <div className="pt-4 border-t border-slate-800">
              <span className="text-[11px] text-slate-400 block text-center mb-2 font-semibold">
                — دخول تجريبي فوري بنقرة واحدة —
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleQuickDemo('admin')}
                  className="bg-purple-950/60 hover:bg-purple-900 border border-purple-500/40 text-purple-300 p-2 rounded-xl text-[11px] font-bold text-center transition-all cursor-pointer"
                  title="الدخول كمدير المنصة الشامل"
                >
                  👑 صاحب المنصة
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickDemo('baghdad')}
                  className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 p-2 rounded-xl text-[11px] font-bold text-center transition-all cursor-pointer"
                  title="مولدة القدس - بغداد"
                >
                  ⚡ مولدة بغداد
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickDemo('basra')}
                  className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 p-2 rounded-xl text-[11px] font-bold text-center transition-all cursor-pointer"
                  title="مولدة النور - البصرة"
                >
                  ⚡ مولدة البصرة
                </button>
              </div>
            </div>
          </form>
        ) : (
          /* نموذج تسجيل مولدة جديدة في الـ SaaS */
          <form onSubmit={handleRegister} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                اسم المولدة *
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="مثال: مولدة حي الجامعة الأهلية"
                  value={regGenName}
                  onChange={(e) => setRegGenName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pr-10 pl-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
                <Building className="w-4 h-4 text-slate-500 absolute right-3 top-2.5" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  اسم المالك / المسؤول
                </label>
                <input
                  type="text"
                  placeholder="مثال: أبو فهد"
                  value={regOwnerName}
                  onChange={(e) => setRegOwnerName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  رقم الهاتف (لتسجيل الدخول) *
                </label>
                <input
                  type="tel"
                  required
                  placeholder="077XXXXXXXX"
                  value={regPhone}
                  onChange={(e) => setRegPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  المحافظة
                </label>
                <select
                  value={regCity}
                  onChange={(e) => setRegCity(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="بغداد">بغداد</option>
                  <option value="البصرة">البصرة</option>
                  <option value="النجف الأشرف">النجف الأشرف</option>
                  <option value="كربلاء المقدسة">كربلاء المقدسة</option>
                  <option value="أربيل">أربيل</option>
                  <option value="بابل">بابل</option>
                  <option value="ذي قار">ذي قار</option>
                  <option value="نينوى">نينوى</option>
                  <option value="ديالى">ديالى</option>
                  <option value="الأنبار">الأنبار</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  المنطقة / الحي
                </label>
                <input
                  type="text"
                  placeholder="مثال: شارع فلسطين"
                  value={regAddress}
                  onChange={(e) => setRegAddress(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                كلمة المرور *
              </label>
              <input
                type="password"
                required
                placeholder="أنشئ كلمة مرور لحسابك"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="bg-amber-500/10 border border-amber-500/30 p-2.5 rounded-xl text-[11px] text-amber-300 leading-tight">
              🎁 <strong>عرض خاص:</strong> ستحصل على فترة تجريبية مجانية لمدة 14 يوماً بكامل الميزات دون أي دفع مسبق.
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-xl shadow-lg shadow-emerald-600/20 text-xs transition-all cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              إنشاء حساب المولدة وبدء التجربة المجانية
            </button>
          </form>
        )}

      </div>

    </div>
  );
};
