import { useState, useMemo, type FC } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { formatIQD } from '../services/billingService';
import type { TenantSettings } from '../types';
import {
  Building2,
  Users,
  DollarSign,
  TrendingUp,
  Search,
  CheckCircle,
  AlertCircle,
  Clock,
  MessageCircle,
  LogIn,
  Power,
  KeyRound
} from 'lucide-react';

interface SuperAdminScreenProps {
  onSwitchToTenant: (tenant: TenantSettings) => void;
  onLogout: () => void;
}



export const SuperAdminScreen: FC<SuperAdminScreenProps> = ({
  onSwitchToTenant,
  onLogout,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCity, setSelectedCity] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired' | 'blocked'>('all');

  // جلب كافة المولدات والمشتركين والفواتير
  const tenants = useLiveQuery(() => db.settings.toArray()) || [];
  const allSubscribers = useLiveQuery(() => db.subscribers.toArray()) || [];

  // إحصائيات المنصة الكلية
  const platformStats = useMemo(() => {
    const totalTenants = tenants.length;
    const activeTenants = tenants.filter((t) => !t.isBlocked && new Date(t.expiresAt) > new Date()).length;
    const expiredTenants = tenants.filter((t) => new Date(t.expiresAt) <= new Date()).length;

    // مجموع أرباح اشتراكات الـ SaaS من المولدات
    const totalSaasRevenue = tenants.reduce((sum, t) => sum + (t.planPrice || 0), 0);
    const totalSubscribersAcrossIraq = allSubscribers.length;
    const totalAmperes = allSubscribers.reduce((sum, s) => sum + s.amperes, 0);

    return {
      totalTenants,
      activeTenants,
      expiredTenants,
      totalSaasRevenue,
      totalSubscribersAcrossIraq,
      totalAmperes,
    };
  }, [tenants, allSubscribers]);

  // فلترة المولدات
  const filteredTenants = useMemo(() => {
    return tenants.filter((t) => {
      const term = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !term ||
        t.generatorName.toLowerCase().includes(term) ||
        t.ownerName.toLowerCase().includes(term) ||
        t.phone.includes(term) ||
        t.address.toLowerCase().includes(term);

      const matchesCity = selectedCity === 'all' || t.address.includes(selectedCity);

      const isExpired = new Date(t.expiresAt) <= new Date();
      let matchesStatus = true;
      if (statusFilter === 'active') matchesStatus = !t.isBlocked && !isExpired;
      if (statusFilter === 'expired') matchesStatus = isExpired;
      if (statusFilter === 'blocked') matchesStatus = t.isBlocked;

      return matchesSearch && matchesCity && matchesStatus;
    });
  }, [tenants, searchTerm, selectedCity, statusFilter]);

  // تمديد اشتراك مولدة
  const handleExtendSubscription = async (tenant: TenantSettings, days: number) => {
    const currentExpiry = new Date(tenant.expiresAt > new Date().toISOString() ? tenant.expiresAt : new Date());
    currentExpiry.setDate(currentExpiry.getDate() + days);

    const priceToAdd = days >= 365 ? 180000 : 20000;
    await db.settings.update(tenant.id, {
      expiresAt: currentExpiry.toISOString(),
      subscriptionStatus: 'active',
      isBlocked: false,
      planPrice: (tenant.planPrice || 0) + priceToAdd,
    });
  };

  // حظر / إلغاء حظر مولدة
  const handleToggleBlock = async (tenant: TenantSettings) => {
    await db.settings.update(tenant.id, {
      isBlocked: !tenant.isBlocked,
    });
  };

  // إرسال مطالبة تجديد اشتراك بالواتساب لصاحب المولدة
  const handleSendRenewalWhatsApp = (tenant: TenantSettings) => {
    let phone = tenant.phone.trim().replace(/\s+/g, '').replace(/-/g, '');
    if (phone.startsWith('07')) {
      phone = '964' + phone.substring(1);
    }

    const expiryDateStr = new Date(tenant.expiresAt).toLocaleDateString('ar-IQ');
    const message = `تحية طيبة أخي العزيز ${tenant.ownerName} صاحب (${tenant.generatorName})،
نود إعلامكم بأن اشتراك منظومة المولدات الأهلية السحابية الخاص بكم ينتهي بتاريخ: ${expiryDateStr}.
يرجى تجديد الاشتراك الشهري (20,000 د.ع) أو السنوي (180,000 د.ع) عبر زين كاش أو كي كارد لضمان استمرار عمل المزامنة السحابية والحفظ التلقائي للوصولات.
للتجديد تواصل معنا مباشرة. تحياتنا، إدارة منصة المولدات.`;

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  // إعادة تعيين كلمة المرور لصاحب المولدة وإرسالها بالواتساب
  const handleResetPassword = async (tenant: TenantSettings) => {
    const newPass = prompt(`أدخل رمز الدخول (كلمة المرور) الجديد لمولدة (${tenant.generatorName}):`, '123456');
    if (!newPass || !newPass.trim()) return;

    // تحديث كلمة المرور في جدول المستخدمين
    const user = await db.users.where('tenantId').equals(tenant.id).first();
    if (user) {
      await db.users.update(user.id, { password: newPass.trim() });
    }

    let phone = tenant.phone.trim().replace(/\s+/g, '').replace(/-/g, '');
    if (phone.startsWith('07')) {
      phone = '964' + phone.substring(1);
    }

    const message = `أهلاً بك أخي ${tenant.ownerName} صاحب (${tenant.generatorName})،
تمت إعادة تعيين رمز الدخول الخاص بحسابكم في منظومة المولدات السحابية بنجاح:
🔑 رمز الدخول الجديد: ${newPass.trim()}
رابط تسجيل الدخول: http://localhost:5173/`;

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  return (

    <div className="space-y-5 pb-12">
      
      {/* شريط الإشراف العلوي */}
      <div className="bg-purple-950/40 border border-purple-500/30 rounded-3xl p-5 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-purple-600/30 border border-purple-500/50 flex items-center justify-center text-purple-300 shadow-lg">
            <Building2 className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-white">لوحة تحكم صاحب المنصة (Super Admin)</h2>
              <span className="bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                السيطرة المركزية
              </span>
            </div>
            <p className="text-xs text-purple-200/70 mt-0.5">
              متابعة جميع المولدات الأهلية المشتركة في العراق، إدارة الاشتراكات، وتحصيل رسوم الـ SaaS
            </p>
          </div>
        </div>

        <button
          onClick={onLogout}
          className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
        >
          <Power className="w-4 h-4 text-rose-400" />
          <span>تسجيل خروج المشرف</span>
        </button>
      </div>

      {/* المؤشرات المالية والإحصائية للمنصة */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        
        {/* إيرادات الـ SaaS */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-medium">أرباح اشتراكات المنصة</span>
            <div className="text-xl font-black text-amber-400 mt-1">
              {formatIQD(platformStats.totalSaasRevenue)}
            </div>
            <span className="text-[10px] text-emerald-400 flex items-center gap-1 mt-0.5 font-bold">
              <TrendingUp className="w-3 h-3" /> اشتراكات شهرية وسنوية
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        {/* المولدات المشتركة */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-medium">إجمالي المولدات المسجلة</span>
            <div className="text-xl font-black text-white mt-1">
              {platformStats.totalTenants} <span className="text-xs font-normal text-slate-400">مولدة</span>
            </div>
            <span className="text-[10px] text-emerald-400 mt-0.5 block font-semibold">
              {platformStats.activeTenants} مولدة نشطة مسددة
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Building2 className="w-5 h-5" />
          </div>
        </div>

        {/* المولدات المنتهية */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-medium">اشتراكات بحاجة للتجديد</span>
            <div className="text-xl font-black text-rose-400 mt-1">
              {platformStats.expiredTenants} <span className="text-xs font-normal text-slate-400">مولدة</span>
            </div>
            <span className="text-[10px] text-rose-400/80 mt-0.5 block font-semibold">
              تتطلب تذكير بالواتساب
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        {/* المشتركون عبر العراق */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-400 font-medium">المشتركين في عموم العراق</span>
            <div className="text-xl font-black text-blue-400 mt-1">
              {platformStats.totalSubscribersAcrossIraq} <span className="text-xs font-normal text-slate-400">عائلة/محل</span>
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              حمل كلي: {platformStats.totalAmperes} أمبير
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Users className="w-5 h-5" />
          </div>
        </div>

      </div>

      {/* شريط البحث وفلترة المولدات */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 sm:p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute right-3.5 top-3.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="ابحث باسم المولدة، اسم صاحب المولدة، الهاتف، أو المنطقة..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl pr-10 pl-4 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
            />
          </div>

          {/* فلتر المحافظة */}
          <select

            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 cursor-pointer"
          >
            <option value="all">كل المحافظات</option>
            <option value="بغداد">بغداد</option>
            <option value="البصرة">البصرة</option>
            <option value="النجف">النجف</option>
            <option value="كربلاء">كربلاء</option>
            <option value="أربيل">أربيل</option>
          </select>

          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">

            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                statusFilter === 'all' ? 'bg-purple-600 text-white font-bold' : 'text-slate-400'
              }`}
            >
              الكل ({tenants.length})
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                statusFilter === 'active' ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400'
              }`}
            >
              نشطة
            </button>
            <button
              onClick={() => setStatusFilter('expired')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                statusFilter === 'expired' ? 'bg-rose-600 text-white font-bold' : 'text-slate-400'
              }`}
            >
              منتهية
            </button>
            <button
              onClick={() => setStatusFilter('blocked')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                statusFilter === 'blocked' ? 'bg-slate-700 text-white font-bold' : 'text-slate-400'
              }`}
            >
              محظورة
            </button>
          </div>
        </div>
      </div>

      {/* جدول وبطاقات المولدات المسجلة في المنصة */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-white flex items-center justify-between px-1">
          <span>قائمة المولدات المشتركة ({filteredTenants.length})</span>
          <span className="text-xs text-slate-400 font-normal">يمكنك الدخول لحساب أي مولدة لتقديم الدعم الفني</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredTenants.map((t) => {
            const isExpired = new Date(t.expiresAt) <= new Date();
            const daysLeft = Math.ceil((new Date(t.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            const subCount = allSubscribers.filter((s) => s.tenantId === t.id).length;

            return (
              <div
                key={t.id}
                className={`bg-slate-900 border rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-md transition-all ${
                  t.isBlocked
                    ? 'border-rose-700 bg-rose-950/10'
                    : isExpired
                    ? 'border-amber-600/50'
                    : 'border-slate-800'
                }`}
              >
                <div>
                  {/* رأس بطاقة المولدة */}
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-base text-white flex items-center gap-1.5">
                        {t.generatorName}
                        {t.isBlocked && (
                          <span className="text-[10px] bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded font-bold">
                            محظور
                          </span>
                        )}
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">👤 المالك: {t.ownerName}</p>
                      <p className="text-xs text-slate-400">📞 {t.phone}</p>
                      <p className="text-xs text-slate-500">📍 {t.address}</p>
                    </div>

                    <div className="text-left">
                      <span className="text-[11px] font-bold bg-purple-500/10 text-purple-300 border border-purple-500/20 px-2 py-0.5 rounded-lg block">
                        {t.plan === 'yearly' ? 'اشتراك سنوي' : t.plan === 'monthly' ? 'اشتراك شهري' : 'فترة تجريبية'}
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-1">
                        {subCount} مشترك مسجل
                      </span>
                    </div>
                  </div>

                  {/* تفاصيل الصلاحية */}
                  <div className="mt-3 bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs flex items-center justify-between">
                    <span className="text-slate-400">حالة الاشتراك:</span>
                    {isExpired ? (
                      <span className="text-rose-400 font-bold flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> منتهي ({Math.abs(daysLeft)} يوم مضت)
                      </span>
                    ) : (
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> ساري (متبقي {daysLeft} يوماً)
                      </span>
                    )}
                  </div>
                </div>

                {/* أزرار إدارة المولدة للسوبر أدمن */}
                <div className="pt-2 border-t border-slate-800 space-y-2">
                  
                  {/* زر الدخول المباشر بحساب المولدة */}
                  <button
                    onClick={() => onSwitchToTenant(t)}
                    className="w-full flex items-center justify-center gap-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 rounded-xl text-xs transition-all cursor-pointer shadow-md shadow-purple-600/20"
                    title="الدخول إلى شاشة الجباية والمشتركين الخاصة بهذه المولدة"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>الدخول ومعاينة لوحة المولدة</span>
                  </button>

                  <div className="grid grid-cols-4 gap-1 text-[11px]">
                    {/* تمديد شهر */}
                    <button
                      onClick={() => handleExtendSubscription(t, 30)}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 py-1.5 rounded-lg font-semibold transition-colors text-center"
                      title="تمديد الاشتراك 30 يوماً إضافياً"
                    >
                      +30 يوم
                    </button>

                    {/* تغيير الرمز */}
                    <button
                      onClick={() => handleResetPassword(t)}
                      className="bg-amber-950/60 hover:bg-amber-900 border border-amber-600/30 text-amber-400 py-1.5 rounded-lg font-semibold flex items-center justify-center gap-1 transition-colors text-center"
                      title="إعادة تعيين رمز الدخول وإرساله بالواتساب"
                    >
                      <KeyRound className="w-3 h-3" />
                      <span>الرمز</span>
                    </button>

                    {/* واتساب للتذكير */}
                    <button
                      onClick={() => handleSendRenewalWhatsApp(t)}
                      className="bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-600/30 text-emerald-400 py-1.5 rounded-lg font-semibold flex items-center justify-center gap-1 transition-colors text-center"
                      title="إرسال رسالة مطالبة تجديد بالواتساب"
                    >
                      <MessageCircle className="w-3 h-3" />
                      <span>تذكير</span>
                    </button>

                    {/* حظر / فك حظر */}
                    <button
                      onClick={() => handleToggleBlock(t)}
                      className={`py-1.5 rounded-lg font-semibold border transition-colors text-center ${
                        t.isBlocked
                          ? 'bg-emerald-950/60 border-emerald-500/30 text-emerald-400'
                          : 'bg-rose-950/60 border-rose-500/30 text-rose-400'
                      }`}
                      title={t.isBlocked ? 'فك حظر المولدة' : 'حظر حساب المولدة'}
                    >
                      {t.isBlocked ? 'فك' : 'حظر'}
                    </button>
                  </div>


                </div>

              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
};
