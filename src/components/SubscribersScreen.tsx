import { useState, useMemo, type FC } from 'react';


import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import {
  formatIQD,
  roundIQD,
  calculateUnitPrice,
  syncSubscriberInvoiceForCurrentCycle,
  syncAllMissingInvoices,
  getLatestActiveCycle
} from '../services/billingService';
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
  History,
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  Zap
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

  // حالة استيراد المشتركين من ملف Excel / CSV
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [parsedImportSubscribers, setParsedImportSubscribers] = useState<any[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

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

  // جلب أحدث دورة تسعيرة نشطة لحساب تكلفة المشتركين الفورية
  const latestCycle = useLiveQuery(
    () => getLatestActiveCycle(tenantId),
    [tenantId]
  );

  // خريطة لربط كل مشترك بأحدث فاتورة صادرة له
  const invoiceMap = useMemo(() => {
    const map = new Map<string, Invoice>();
    const sorted = [...invoices].sort((a, b) => {
      const orderA = (a.year || 0) * 100 + (a.month || 0);
      const orderB = (b.year || 0) * 100 + (b.month || 0);
      if (orderA !== orderB) return orderA - orderB;
      return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
    });
    sorted.forEach((inv) => {
      map.set(inv.subscriberId, inv);
    });
    return map;
  }, [invoices]);

  // احتساب المعاينة المباشرة لتكلفة الاشتراك للشهر الحالي أثناء تعبئة النافذة
  const currentCyclePreview = useMemo(() => {
    if (!latestCycle) return null;
    const ampNum = parseFloat(amperes) || 0;
    const fixedNum = parseFloat(fixedPrice) || 0;
    const openBalNum = parseFloat(openingBalance) || 0;

    const mockSub: Partial<Subscriber> = {
      subscriptionType,
      fixedPrice: fixedNum,
      amperes: ampNum,
    };
    const unitPrice = calculateUnitPrice(mockSub as Subscriber, latestCycle);
    const monthlyCost = subscriptionType === 'fixed' ? fixedNum : roundIQD(ampNum * unitPrice);
    const totalRequired = monthlyCost + openBalNum;

    return {
      cycleName: `شهر ${latestCycle.month} / ${latestCycle.year}`,
      unitPrice,
      monthlyCost,
      totalRequired,
    };
  }, [latestCycle, amperes, fixedPrice, openingBalance, subscriptionType]);


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

  // حفظ المشترك (إضافة أو تعديل مع مزامنة واحتساب فوري لفاتورة الشهر)
  const handleSaveSubscriber = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !breakerNumber.trim()) {
      alert('يرجى ملء اسم المشترك ورقم القاطع على الأقل');
      return;
    }

    const ampNum = parseFloat(amperes) || 1;
    const openBalNum = parseFloat(openingBalance) || 0;
    const fixedNum = fixedPrice ? parseFloat(fixedPrice) : undefined;
    const now = new Date().toISOString();

    if (editingSub) {
      // تعديل
      const updatedSub: Subscriber = {
        ...editingSub,
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
        updatedAt: now,
      };

      await db.subscribers.update(editingSub.id, updatedSub);

      // تسجيل التعديل في طابور المزامنة
      await db.syncQueue.add({
        id: `sync-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
        action: 'update',
        entity: 'subscribers',
        entityId: editingSub.id,
        payload: updatedSub,
        createdAt: now,
        attempts: 0,
      });

      // مزامنة فورية واحتساب فوري لفاتورة الدورة الحالية (تعديل عدد الأمبيرات في وسط الشهر)
      if (isActive) {
        await syncSubscriberInvoiceForCurrentCycle(updatedSub);
      }
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
        createdAt: now,
        updatedAt: now,
      };

      await db.subscribers.add(newSub);

      // تسجيل الإضافة في طابور المزامنة
      await db.syncQueue.add({
        id: `sync-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
        action: 'insert',
        entity: 'subscribers',
        entityId: newSub.id,
        payload: newSub,
        createdAt: now,
        attempts: 0,
      });

      // توليد واحتساب فاتورة فورية للشهر الحالي للمشترك الجديد
      if (isActive) {
        await syncSubscriberInvoiceForCurrentCycle(newSub);
      }
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
    const nextActive = !sub.isActive;
    const now = new Date().toISOString();
    const updatedSub: Subscriber = {
      ...sub,
      isActive: nextActive,
      updatedAt: now,
    };

    await db.subscribers.update(sub.id, {
      isActive: nextActive,
      updatedAt: now,
    });

    await db.syncQueue.add({
      id: `sync-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      action: 'update',
      entity: 'subscribers',
      entityId: sub.id,
      payload: updatedSub,
      createdAt: now,
      attempts: 0,
    });

    // إذا تمت إعادة تفعيل المشترك، يتم توليد/تحديث فاتورته فوراً
    if (nextActive) {
      await syncSubscriberInvoiceForCurrentCycle(updatedSub);
    }
  };

  // تصدير كشف المشتركين إلى ملف Excel / CSV متوافق 100% مع الحروف العربية
  const handleExportCSV = () => {
    if (subscribers.length === 0) {
      alert('لا يوجد مشتركين لتصديرهم');
      return;
    }
    const headers = [
      'الاسم الكامل',
      'رقم الهاتف',
      'الشارع_الزقاق',
      'رقم_القاطع',
      'عدد_الأمبيرات',
      'نوع_الاشتراك',
      'السعر_المقطوع',
      'ديون_سابقة',
      'الحالة',
      'ملاحظات',
    ];
    const rows = subscribers.map((s) => [
      `"${s.fullName.replace(/"/g, '""')}"`,
      `"${s.phone}"`,
      `"${s.street.replace(/"/g, '""')}"`,
      `"${s.breakerNumber}"`,
      s.amperes,
      `"${s.subscriptionType}"`,
      s.fixedPrice || 0,
      s.openingBalance || 0,
      s.isActive ? 'نشط' : 'معطل',
      `"${(s.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `مشتركين-المولدة-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // تحميل نموذج إكسل فارغ جاهز للتعبئة
  const handleDownloadTemplate = () => {
    const headers = [
      'الاسم الكامل',
      'رقم الهاتف',
      'الشارع_الزقاق',
      'رقم_القاطع',
      'عدد_الأمبيرات',
      'نوع_الاشتراك',
      'السعر_المقطوع',
      'ديون_سابقة',
      'ملاحظات',
    ];
    const sampleRows = [
      ['أحمد جاسم محمد', '07701234567', 'شارع المنصور الرئيسي', 'B-101', '5', 'normal', '0', '0', 'ملاحظة تجريبية'],
      ['حيدر سعدون العبيدي', '07801234567', 'فرع السوق / زقاق 4', 'B-102', '10', 'gold', '0', '15000', ''],
      ['محمود علي الكعبي', '07501234567', 'شارع 14 رمضان', 'B-103', '4', 'normal', '0', '0', ''],
    ];
    const csvContent = '\uFEFF' + [headers.join(','), ...sampleRows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'نموذج_إدخال_مشتركين_المولدة.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // قراءة وتحليل ملف CSV المرفوع
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const cleanText = text.replace(/^\uFEFF/, '');
        const lines = cleanText.split(/\r?\n/).filter((line) => line.trim().length > 0);
        if (lines.length <= 1) {
          setImportError('الملف فارغ أو لا يحتوي على بيانات بعد سطر العناوين');
          return;
        }

        const parsed: any[] = [];
        for (let i = 1; i < lines.length; i++) {
          const row = lines[i];
          const delimiter = row.includes('\t') ? '\t' : row.includes(';') ? ';' : ',';
          const cols = row.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, '').trim());
          if (cols.length < 1 || !cols[0]) continue;

          const fullName = cols[0];
          const phone = cols[1] || '';
          const street = cols[2] || 'شارع الرئيسي';
          const breakerNumber = cols[3] || `Q-${i}`;
          const amperes = parseFloat(cols[4]) || 4;
          let subType: SubscriptionType = 'normal';
          if (cols[5]?.includes('gold') || cols[5]?.includes('ذهب')) subType = 'gold';
          else if (cols[5]?.includes('night') || cols[5]?.includes('مسائ')) subType = 'night';
          else if (cols[5]?.includes('fixed') || cols[5]?.includes('مقطوع')) subType = 'fixed';
          const fixedPrice = parseFloat(cols[6]) || undefined;
          const openingBalance = parseFloat(cols[7]) || 0;
          const notes = cols[8] || '';

          parsed.push({
            fullName,
            phone,
            street,
            breakerNumber,
            amperes,
            subscriptionType: subType,
            fixedPrice,
            openingBalance,
            notes,
            isActive: true,
          });
        }

        if (parsed.length === 0) {
          setImportError('لم يتم العثور على أي صفوف صالحة. يرجى استخدام النموذج المعتمد.');
          return;
        }

        setParsedImportSubscribers(parsed);
      } catch (err: any) {
        setImportError('حدث خطأ أثناء قراءة الملف: ' + (err.message || 'تنسيق غير مدعوم'));
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  // تأكيد إدراج المشتركين دفعة واحدة
  const handleConfirmImport = async () => {
    if (parsedImportSubscribers.length === 0) return;
    setIsImporting(true);
    try {
      const now = new Date().toISOString();
      for (const item of parsedImportSubscribers) {
        const sub: Subscriber = {
          id: `sub-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          tenantId,
          fullName: item.fullName,
          phone: item.phone,
          street: item.street,
          breakerNumber: item.breakerNumber,
          amperes: item.amperes,
          subscriptionType: item.subscriptionType,
          fixedPrice: item.fixedPrice,
          openingBalance: item.openingBalance,
          notes: item.notes,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        };
        await db.subscribers.add(sub);
        await db.syncQueue.add({
          id: `sync-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
          action: 'insert',
          entity: 'subscribers',
          entityId: sub.id,
          payload: sub,
          createdAt: now,
          attempts: 0,
        });
      }

      // مزامنة واحتساب فوري لفواتير الشهر الحالي لجميع المشتركين المستوردين الجدد
      await syncAllMissingInvoices(tenantId);

      setIsImportModalOpen(false);
      setParsedImportSubscribers([]);
      alert(`تم استيراد ${parsedImportSubscribers.length} مشترك وتوليد فواتيرهم فوراً بنجاح!`);
    } catch (err) {
      console.error('Import error:', err);
      alert('حدث خطأ أثناء استيراد المشتركين');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-4 pb-12">
      
      {/* شريط الإجراءات العلوي */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/80 border border-slate-800 rounded-2xl p-3 sm:p-4 shadow-lg">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span>سجل المشتركين والقواطع</span>
            <span className="text-xs font-semibold bg-slate-800 text-amber-400 px-2.5 py-0.5 rounded-full border border-slate-700">
              {subscribers.length} مشترك
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            إدارة المشتركين، أرقام الفيز والقواطع، وتخصيص الأمبيرات ونوع الخط
          </p>
        </div>

        {/* أزرار الإجراءات (إضافة، استيراد إكسل، تصدير) */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border border-slate-700"
            title="تصدير كشف المشتركين إلى ملف Excel"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">تصدير إكسل</span>
          </button>

          <button
            onClick={() => {
              setParsedImportSubscribers([]);
              setImportError(null);
              setIsImportModalOpen(true);
            }}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border border-slate-700"
            title="استيراد مشتركين من ملف Excel / CSV"
          >
            <Upload className="w-4 h-4 text-blue-400" />
            <span className="hidden sm:inline">استيراد إكسل</span>
          </button>

          <button
            onClick={handleOpenAdd}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-2.5 px-4 rounded-xl shadow-lg shadow-amber-500/20 text-xs sm:text-sm transition-all cursor-pointer active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>إضافة مشترك جديد</span>
          </button>
        </div>
      </div>

      {/* شريط البحث الميداني البارز والمخصص للهواتف المحمولة */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 space-y-2.5 shadow-md">
        <div className="relative flex items-center">
          <Search className="absolute right-3.5 w-5 h-5 text-amber-400 pointer-events-none" />
          <input
            type="text"
            placeholder="🔍 ابحث بالاسم، رقم القاطع، الهاتف، أو الشارع..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700/80 focus:border-amber-500 rounded-xl pr-11 pl-10 py-3 text-sm text-white placeholder-slate-400 focus:outline-none transition-all shadow-inner"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute left-3 p-1 text-slate-400 hover:text-white bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title="مسح البحث"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* مؤشر عدد النتائج وأزرار الأزقة */}
        <div className="flex items-center justify-between gap-2 text-xs text-slate-400 flex-wrap">
          <span className="font-semibold text-slate-300">
            عرض {filteredSubscribers.length} من أصل {subscribers.length} مشترك
          </span>

          {streetsList.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
              <button
                onClick={() => setSelectedStreet('all')}
                className={`px-3 py-1.5 rounded-xl transition-all whitespace-nowrap cursor-pointer font-bold ${
                  selectedStreet === 'all'
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                }`}
              >
                كل الأزقة ({subscribers.length})
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

                {/* تفاصيل نوع الاشتراك وتكلفة الشهر الحالي الفورية */}
                {(() => {
                  const subInvoice = invoiceMap.get(sub.id);
                  const currentCost = subInvoice
                    ? subInvoice.currentAmount
                    : latestCycle && sub.isActive
                    ? sub.subscriptionType === 'fixed'
                      ? sub.fixedPrice || 0
                      : roundIQD(sub.amperes * calculateUnitPrice(sub, latestCycle))
                    : 0;

                  return (
                    <div className="mt-3 pt-2.5 border-t border-slate-700/60 flex items-center justify-between text-xs text-slate-300">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="bg-slate-900/80 px-2 py-0.5 rounded text-[11px] text-slate-400">
                          {typeLabel}
                        </span>
                        {currentCost > 0 && (
                          <span className="text-amber-400 font-bold bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 rounded text-[11px] flex items-center gap-1">
                            <Zap className="w-3 h-3 text-amber-400 fill-amber-400" />
                            <span>اشتراك الشهر: {formatIQD(currentCost)}</span>
                          </span>
                        )}
                      </div>
                      {sub.openingBalance > 0 && (
                        <span className="text-rose-400 font-semibold">
                          دين سابق: {formatIQD(sub.openingBalance)}
                        </span>
                      )}
                    </div>
                  );
                })()}

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

              {/* بطاقة المعاينة الفورية لتكلفة الاشتراك للشهر الحالي */}
              {currentCyclePreview && isActive && (
                <div className="bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-transparent border border-amber-500/30 rounded-xl p-3 text-xs space-y-1.5 animate-in fade-in">
                  <div className="flex items-center justify-between text-amber-400 font-bold">
                    <span className="flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
                      <span>تكلفة الاشتراك الفورية ({currentCyclePreview.cycleName}):</span>
                    </span>
                    <span className="text-sm font-black text-amber-300">
                      {formatIQD(currentCyclePreview.totalRequired)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400 text-[11px] pt-1 border-t border-amber-500/20">
                    <span>
                      {subscriptionType === 'fixed'
                        ? 'اشتراك مقطوع بسعر ثابت'
                        : `سعر الأمبير (${formatIQD(currentCyclePreview.unitPrice)}) × ${parseFloat(amperes) || 0} أمبير = ${formatIQD(currentCyclePreview.monthlyCost)}`}
                    </span>
                    {parseFloat(openingBalance) > 0 && (
                      <span className="text-rose-400 font-semibold">
                        + دين سابق ({formatIQD(parseFloat(openingBalance))})
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span>توليد واحتساب فوري للفاتورة في شاشة التحصيل بمجرد الحفظ دون الحاجة لإعادة التسعير.</span>
                  </p>
                </div>
              )}

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

      {/* نافذة استيراد المشتركين من Excel / CSV */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/85 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* رأس النافذة */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-white text-base">استيراد المشتركين من ملف Excel</h3>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* محتوى النافذة */}
            <div className="p-4 space-y-4 overflow-y-auto">
              
              {/* الخطوة 1: تنزيل النموذج */}
              <div className="bg-slate-950 border border-slate-800 p-3.5 rounded-xl flex items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-bold text-slate-200 block">
                    1. تحميل النموذج المعتمد
                  </span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    قم بتنزيل النموذج وتعبئة أسماء المشتركين وأرقام قواطعهم وأمبيراتهم عبر Excel.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/30 px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>تنزيل النموذج</span>
                </button>
              </div>

              {/* الخطوة 2: رفع الملف */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-200">
                  2. اختيار ملف الإكسل المعبأ (ملف .csv)
                </label>
                <label className="border-2 border-dashed border-slate-700 hover:border-amber-500/60 bg-slate-950/60 hover:bg-slate-950 p-6 rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer transition-all">
                  <Upload className="w-8 h-8 text-amber-400 animate-bounce" />
                  <span className="text-xs font-bold text-slate-200">
                    اضغط هنا لاختيار الملف من هاتفك أو جهازك
                  </span>
                  <span className="text-[10px] text-slate-500">
                    يدعم ملفات CSV أو نصوص الإكسل المصدرة
                  </span>
                  <input
                    type="file"
                    accept=".csv, text/csv, .txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {/* رسائل الخطأ إن وجدت */}
              {importError && (
                <div className="bg-rose-500/15 border border-rose-500/30 p-3 rounded-xl flex items-center gap-2 text-xs text-rose-300">
                  <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              {/* المعاينة المسبقة للبيانات */}
              {parsedImportSubscribers.length > 0 && (
                <div className="space-y-2">
                  <div className="bg-emerald-500/15 border border-emerald-500/30 p-2.5 rounded-xl flex items-center gap-2 text-xs font-bold text-emerald-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span>
                      تم فحص الملف بنجاح! تم العثور على {parsedImportSubscribers.length} مشترك جاهز للإدخال.
                    </span>
                  </div>

                  {/* قائمة عينات للمعاينة */}
                  <div className="max-h-44 overflow-y-auto border border-slate-800 rounded-xl divide-y divide-slate-800/80 bg-slate-950 text-xs">
                    {parsedImportSubscribers.slice(0, 10).map((sub, idx) => (
                      <div key={idx} className="p-2.5 flex items-center justify-between">
                        <div>
                          <span className="font-bold text-white block">{sub.fullName}</span>
                          <span className="text-[10px] text-slate-400">
                            {sub.street} - {sub.phone || 'بدون هاتف'}
                          </span>
                        </div>
                        <div className="text-left bg-slate-900 px-2 py-1 rounded border border-slate-800">
                          <span className="text-amber-400 font-bold block">{sub.breakerNumber}</span>
                          <span className="text-[10px] text-slate-300">{sub.amperes} أمبير</span>
                        </div>
                      </div>
                    ))}
                    {parsedImportSubscribers.length > 10 && (
                      <div className="p-2 text-center text-slate-500 text-[11px] italic">
                        + {parsedImportSubscribers.length - 10} مشترك إضافي...
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>

            {/* أزرار الإجراءات في النافذة */}
            <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center gap-2">
              <button
                type="button"
                disabled={parsedImportSubscribers.length === 0 || isImporting}
                onClick={handleConfirmImport}
                className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-black py-3 rounded-xl text-xs sm:text-sm transition-all cursor-pointer shadow-lg shadow-amber-500/20 active:scale-95"
              >
                {isImporting
                  ? 'جاري الاستيراد...'
                  : `تأكيد وإدخال (${parsedImportSubscribers.length}) مشترك الآن`}
              </button>
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3 px-4 rounded-xl text-xs sm:text-sm transition-all cursor-pointer"
              >
                إلغاء
              </button>
            </div>

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
  // إجمالي المبالغ المفوترة تاريخياً: مجموع مبالغ الأشهر الفعلية + الرصيد الافتتاحي - مجموع التخفيضات
  const totalBilled =
    invoices.length > 0
      ? invoices.reduce((sum, inv) => sum + inv.currentAmount, 0) +
        (subscriber.openingBalance || 0) -
        invoices.reduce((sum, inv) => sum + (inv.discount || 0), 0)
      : subscriber.openingBalance || 0;
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = Math.max(0, totalBilled - totalPaid);

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
              <span className="font-bold text-sm text-slate-200">{formatIQD(totalBilled)}</span>
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
