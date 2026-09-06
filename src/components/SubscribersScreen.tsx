import { useState, useMemo, type FC } from 'react';


import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { formatIQD } from '../services/billingService';
import type { Subscriber, SubscriptionType, Payment, Invoice } from '../types';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  UserCheck,
  UserX,
  Phone,
  X,
  Save,
  History
} from 'lucide-react';


interface SubscribersScreenProps {
  tenantId: string;
}

export const SubscribersScreen: FC<SubscribersScreenProps> = ({ tenantId }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStreet, setSelectedStreet] = useState<string>('all');
  
  // حالة نافذة إضافة / تعديل مشترك
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<Subscriber | null>(null);

  // حالة كشف حساب المشترك
  const [statementSub, setStatementSub] = useState<Subscriber | null>(null);

  // نموذج الحقول
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [street, setStreet] = useState('');
  const [breakerNumber, setBreakerNumber] = useState('');
  const [amperes, setAmperes] = useState('4');
  const [subscriptionType, setSubscriptionType] = useState<SubscriptionType>('normal');
  const [fixedPrice, setFixedPrice] = useState('');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);

  // جلب المشتركين والدفعات من IndexedDB بعزل كامل لكل مولدة
  const subscribers = useLiveQuery(
    () => db.subscribers.where('tenantId').equals(tenantId).toArray(),
    [tenantId]
  ) || [];
  const payments = useLiveQuery(
    () => db.payments.where('tenantId').equals(tenantId).toArray(),
    [tenantId]
  ) || [];
  const invoices = useLiveQuery(
    () => db.invoices.where('tenantId').equals(tenantId).toArray(),
    [tenantId]
  ) || [];


  // قائمة الأزقة والشوارع الفريدة
  const streetsList = useMemo(() => {
    const streets = new Set<string>();
    subscribers.forEach((s) => {
      if (s.street) streets.add(s.street.trim());
    });
    return Array.from(streets);
  }, [subscribers]);

  // فلترة المشتركين
  const filteredSubscribers = useMemo(() => {
    return subscribers.filter((sub) => {
      const term = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !term ||
        sub.fullName.toLowerCase().includes(term) ||
        sub.phone.includes(term) ||
        sub.breakerNumber.toLowerCase().includes(term) ||
        sub.street.toLowerCase().includes(term);

      const matchesStreet = selectedStreet === 'all' || sub.street === selectedStreet;

      return matchesSearch && matchesStreet;
    });
  }, [subscribers, searchTerm, selectedStreet]);

  // فتح نافذة الإضافة
  const handleOpenAdd = () => {
    setEditingSub(null);
    setFullName('');
    setPhone('');
    setStreet(streetsList[0] || 'شارع الرئيسي');
    setBreakerNumber('');
    setAmperes('4');
    setSubscriptionType('normal');
    setFixedPrice('');
    setOpeningBalance('0');
    setNotes('');
    setIsActive(true);
    setIsModalOpen(true);
  };

  // فتح نافذة التعديل
  const handleOpenEdit = (sub: Subscriber) => {
    setEditingSub(sub);
    setFullName(sub.fullName);
    setPhone(sub.phone);
    setStreet(sub.street);
    setBreakerNumber(sub.breakerNumber);
    setAmperes(sub.amperes.toString());
    setSubscriptionType(sub.subscriptionType);
    setFixedPrice(sub.fixedPrice ? sub.fixedPrice.toString() : '');
    setOpeningBalance(sub.openingBalance.toString());
    setNotes(sub.notes || '');
    setIsActive(sub.isActive);
    setIsModalOpen(true);
  };

  // حفظ المشترك (إضافة أو تعديل)
  const handleSaveSubscriber = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !breakerNumber.trim()) {
      alert('يرجى ملء اسم المشترك ورقم القاطع على الأقل');
      return;
    }

    const ampNum = parseFloat(amperes) || 1;
    const openBalNum = parseFloat(openingBalance) || 0;
    const fixedNum = fixedPrice ? parseFloat(fixedPrice) : undefined;

    if (editingSub) {
      // تعديل
      await db.subscribers.update(editingSub.id, {
        fullName: fullName.trim(),
        phone: phone.trim(),
        street: street.trim(),
        breakerNumber: breakerNumber.trim(),
        amperes: ampNum,
        subscriptionType,
        fixedPrice: fixedNum,
        openingBalance: openBalNum,
        notes: notes.trim() || undefined,
        isActive,
        updatedAt: new Date().toISOString(),
      });
    } else {
      // إضافة جديد
      const newSub: Subscriber = {
        id: `sub-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        tenantId,
        fullName: fullName.trim(),
        phone: phone.trim(),
        street: street.trim(),
        breakerNumber: breakerNumber.trim(),
        amperes: ampNum,
        subscriptionType,
        fixedPrice: fixedNum,
        openingBalance: openBalNum,
        notes: notes.trim() || undefined,
        isActive,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await db.subscribers.add(newSub);
    }

    setIsModalOpen(false);
  };

  // حذف مشترك
  const handleDeleteSubscriber = async (sub: Subscriber) => {
    if (confirm(`هل أنت متأكد من حذف المشترك (${sub.fullName})؟ سيتم مسح بياناته من المنظومة.`)) {
      await db.subscribers.delete(sub.id);
      // مسح فواتيره المرتبطة
      const relatedInvoices = await db.invoices.where('subscriberId').equals(sub.id).toArray();
      for (const inv of relatedInvoices) {
        await db.invoices.delete(inv.id);
      }
    }
  };

  // تبديل حالة التفعيل
  const handleToggleActive = async (sub: Subscriber) => {
    await db.subscribers.update(sub.id, {
      isActive: !sub.isActive,
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="space-y-4 pb-12">
      
      {/* شريط الإجراءات العلوي */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-800/80 border border-slate-700/60 rounded-2xl p-4 shadow-lg">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span>سجل المشتركين والقواطع</span>
            <span className="text-xs font-semibold bg-slate-700 text-amber-400 px-2 py-0.5 rounded-full">
              {subscribers.length} مشترك
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            إدارة المشتركين، أرقام الفيز والقواطع، وتخصيص الأمبيرات ونوع الخط
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-2.5 px-4 rounded-xl shadow-lg shadow-amber-500/20 text-sm transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          إضافة مشترك جديد
        </button>
      </div>

      {/* شريط البحث والفلترة */}
      <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-3 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute right-3.5 top-3.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="ابحث بالاسم، رقم القاطع، الهاتف، أو الشارع..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl pr-10 pl-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          {streetsList.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              <button
                onClick={() => setSelectedStreet('all')}
                className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap ${
                  selectedStreet === 'all'
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'bg-slate-900 text-slate-400 border border-slate-700'
                }`}
              >
                كل الأزقة
              </button>
              {streetsList.map((st) => (
                <button
                  key={st}
                  onClick={() => setSelectedStreet(st)}
                  className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap ${
                    selectedStreet === st
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'bg-slate-900 text-slate-400 border border-slate-700'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* قائمة المشتركين */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredSubscribers.map((sub) => {
          const typeLabel =
            sub.subscriptionType === 'gold'
              ? 'ذهبي 24 ساعة'
              : sub.subscriptionType === 'night'
              ? 'مسائي'
              : sub.subscriptionType === 'fixed'
              ? 'مقطوعة ثابتة'
              : 'عادي (نهاري+مسائي)';

          return (
            <div
              key={sub.id}
              className={`bg-slate-800/90 border rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-md transition-all ${
                sub.isActive ? 'border-slate-700' : 'border-slate-800 opacity-60'
              }`}
            >
              <div>
                {/* رأس البطاقة */}
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-bold text-base text-white flex items-center gap-2">
                      {sub.fullName}
                      {!sub.isActive && (
                        <span className="text-[10px] bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded">
                          موقوف مؤقتاً
                        </span>
                      )}
                    </h4>
                    <p className="text-xs text-slate-400 mt-1">📍 {sub.street}</p>
                    {sub.phone && (
                      <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3 text-emerald-400" />
                        <span>{sub.phone}</span>
                      </p>
                    )}
                  </div>

                  <div className="text-left bg-slate-900 border border-slate-700 px-2.5 py-1.5 rounded-xl">
                    <span className="text-xs font-black text-amber-400 block">
                      {sub.breakerNumber}
                    </span>
                    <span className="text-[11px] text-slate-300 font-bold">
                      {sub.amperes} أمبير
                    </span>
                  </div>
                </div>

                {/* تفاصيل إضافية */}
                <div className="mt-3 pt-2.5 border-t border-slate-700/60 flex items-center justify-between text-xs text-slate-300">
                  <span className="bg-slate-900/80 px-2 py-0.5 rounded text-[11px] text-slate-400">
                    {typeLabel}
                  </span>
                  {sub.openingBalance > 0 && (
                    <span className="text-rose-400 font-semibold">
                      دين سابق: {formatIQD(sub.openingBalance)}
                    </span>
                  )}
                </div>

                {sub.notes && (
                  <p className="text-xs text-slate-500 mt-2 bg-slate-950/40 p-1.5 rounded">
                    ملاحظة: {sub.notes}
                  </p>
                )}
              </div>

              {/* أزرار العمليات على المشترك */}
              <div className="pt-2 border-t border-slate-700/60 flex items-center justify-between gap-1 text-xs">
                
                {/* كشف الحساب */}
                <button
                  onClick={() => setStatementSub(sub)}
                  className="flex items-center gap-1 text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-2.5 py-1.5 rounded-lg font-medium transition-colors"
                  title="كشف حساب وسجل الدفعات"
                >
                  <History className="w-3.5 h-3.5" />
                  <span>كشف الحساب</span>
                </button>

                <div className="flex items-center gap-1">
                  {/* تفعيل / إيقاف */}
                  <button
                    onClick={() => handleToggleActive(sub)}
                    className={`p-1.5 rounded-lg border transition-colors ${
                      sub.isActive
                        ? 'text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10'
                        : 'text-slate-400 border-slate-700 hover:bg-slate-700'
                    }`}
                    title={sub.isActive ? 'إيقاف الخط مؤقتاً' : 'إعادة تفعيل الخط'}
                  >
                    {sub.isActive ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                  </button>

                  {/* تعديل */}
                  <button
                    onClick={() => handleOpenEdit(sub)}
                    className="p-1.5 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                    title="تعديل بيانات المشترك"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>

                  {/* حذف */}
                  <button
                    onClick={() => handleDeleteSubscriber(sub)}
                    className="p-1.5 rounded-lg border border-rose-500/30 text-rose-400 hover:bg-rose-500/20 transition-colors"
                    title="حذف المشترك نهائياً"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

              </div>

            </div>
          );
        })}
      </div>

      {/* نافذة إضافة / تعديل مشترك (Modal) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
            
            <div className="p-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
              <h3 className="font-bold text-base text-white">
                {editingSub ? 'تعديل بيانات المشترك' : 'إضافة مشترك جديد في المولدة'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSubscriber} className="p-4 overflow-y-auto space-y-3.5 flex-1">
              
              {/* الاسم الثلاثي */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  اسم المشترك الثلاثي *
                </label>
                <input
                  type="text"
                  required
                  placeholder="مثال: أحمد عبد الله الكرخي"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* رقم القاطع / الفيز */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    رقم القاطع / البوكس (على العمود) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: B-105"
                    value={breakerNumber}
                    onChange={(e) => setBreakerNumber(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-amber-400 font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* عدد الأمبيرات */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    عدد الأمبيرات *
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    required
                    value={amperes}
                    onChange={(e) => setAmperes(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* رقم الهاتف */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  رقم الهاتف (لإرسال وصولات الواتساب)
                </label>
                <input
                  type="tel"
                  placeholder="مثال: 07701234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* الزقاق / العنوان */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  الشارع / الزقاق (لتصنيف خط سير الجباية)
                </label>
                <input
                  type="text"
                  placeholder="مثال: شارع الجامع / زقاق 14"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* نوع الاشتراك */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    نوع الخط
                  </label>
                  <select
                    value={subscriptionType}
                    onChange={(e) => setSubscriptionType(e.target.value as SubscriptionType)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="normal">عادي (نهاري + مسائي)</option>
                    <option value="gold">ذهبي (24 ساعة مستمر)</option>
                    <option value="night">مسائي فقط</option>
                    <option value="fixed">مقطوعة بسعر ثابت</option>
                  </select>
                </div>

                {subscriptionType === 'fixed' ? (
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      السعر الثابت شهرياً (د.ع)
                    </label>
                    <input
                      type="number"
                      step="1000"
                      placeholder="مثال: 25000"
                      value={fixedPrice}
                      onChange={(e) => setFixedPrice(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-amber-400 font-bold focus:outline-none focus:border-amber-500"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      ديون سابقة متبقية (رصيد افتتاحي)
                    </label>
                    <input
                      type="number"
                      step="1000"
                      placeholder="0"
                      value={openingBalance}
                      onChange={(e) => setOpeningBalance(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-rose-400 font-bold focus:outline-none focus:border-amber-500"
                    />
                  </div>
                )}
              </div>

              {/* ملاحظات */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  ملاحظات
                </label>
                <input
                  type="text"
                  placeholder="ملاحظات حول المحولة، المنزل، أو الموقع..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* حالة التفعيل */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="isActiveCheck"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-500 bg-slate-950 border-slate-700"
                />
                <label htmlFor="isActiveCheck" className="text-xs text-slate-300 font-medium">
                  الخط نشط ويتم احتساب الفاتورة الشهرية له
                </label>
              </div>

              <div className="pt-4 border-t border-slate-800 flex gap-2">
                <button
                  type="submit"
                  className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-2.5 px-4 rounded-xl shadow-lg shadow-amber-500/20 text-sm transition-all cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  {editingSub ? 'حفظ التعديلات' : 'تسجيل المشترك'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 text-xs text-slate-400 hover:text-white rounded-xl hover:bg-slate-800"
                >
                  إلغاء
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* نافذة كشف حساب المشترك (Statement Modal) */}
      {statementSub && (
        <SubscriberStatementModal
          subscriber={statementSub}
          onClose={() => setStatementSub(null)}
          payments={payments.filter((p) => p.subscriberId === statementSub.id)}
          invoices={invoices.filter((inv) => inv.subscriberId === statementSub.id)}
        />
      )}

    </div>
  );
};

// مكون كشف الحساب وسجل الدفعات التاريخية
const SubscriberStatementModal: FC<{
  subscriber: Subscriber;
  onClose: () => void;

  payments: Payment[];
  invoices: Invoice[];
}> = ({ subscriber, onClose, payments, invoices }) => {
  const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.totalDue, 0) + subscriber.openingBalance;
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = Math.max(0, totalInvoiced - totalPaid);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        <div className="p-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base text-white">كشف حساب المشترك</h3>
            <p className="text-xs text-amber-400 mt-0.5">
              {subscriber.fullName} | القاطع: {subscriber.breakerNumber} ({subscriber.amperes} أمبير)
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {/* ملخص الحساب */}
          <div className="grid grid-cols-3 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
            <div>
              <span className="text-[11px] text-slate-400 block">إجمالي المطلوب:</span>
              <span className="font-bold text-sm text-slate-200">{formatIQD(totalInvoiced)}</span>
            </div>
            <div>
              <span className="text-[11px] text-slate-400 block">إجمالي المسدد:</span>
              <span className="font-bold text-sm text-emerald-400">{formatIQD(totalPaid)}</span>
            </div>
            <div>
              <span className="text-[11px] text-slate-400 block">المتبقي حالياً:</span>
              <span className={`font-bold text-sm ${remaining > 0 ? 'text-rose-400' : 'text-slate-300'}`}>
                {formatIQD(remaining)}
              </span>
            </div>
          </div>

          {/* سجل الدفعات وسندات القبض */}
          <div>
            <h4 className="font-bold text-xs text-slate-300 mb-2 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-amber-400" />
              سجل الدفعات المستلمة ({payments.length})
            </h4>

            {payments.length === 0 ? (
              <p className="text-xs text-slate-500 bg-slate-950/50 p-4 rounded-xl text-center">
                لا توجد دفعات مسجلة لهذا المشترك حتى الآن
              </p>
            ) : (
              <div className="space-y-2">
                {payments.map((p) => (
                  <div
                    key={p.id}
                    className="bg-slate-950/70 border border-slate-800 p-3 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-emerald-400 text-sm">
                          {formatIQD(p.amount)}
                        </span>
                        <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                          {p.receiptNumber}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500 block mt-1">
                        {new Date(p.paymentDate).toLocaleDateString('ar-IQ', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        - المحصل: {p.collectorName}
                      </span>
                      {p.notes && <p className="text-[11px] text-slate-400 mt-0.5">ملاحظة: {p.notes}</p>}
                    </div>

                    <span className="text-[10px] text-emerald-500 font-bold bg-emerald-500/10 px-2 py-1 rounded">
                      واصل
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-3 bg-slate-950 border-t border-slate-800 text-left">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
};
