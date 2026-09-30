/**
 * src/ui/screens/SubscribersScreen.ts
 * Subscribers Screen: List, Search, Filter, Add, Edit, Delete & Contact
 * Mobile-First Vanilla TypeScript
 */

import { db } from '../../db/database.ts';
import { licenseManager } from '../../license/license.ts';
import type { Subscriber, LineType, LineStatus } from '../../types/index.ts';

export class SubscribersScreen {
  private container: HTMLElement;
  private subscribers: Subscriber[] = [];
  private searchQuery: string = '';
  private currentFilter: string = 'الكل';
  private modalElement: HTMLElement | null = null;
  private editingSubscriber: Subscriber | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public async render(): Promise<void> {
    this.container.innerHTML = '';

    const root = document.createElement('div');
    root.className = 'space-y-4';

    // 1. Header & Actions Bar
    const header = document.createElement('div');
    header.className = 'flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3';

    const titleGroup = document.createElement('div');
    const title = document.createElement('h2');
    title.className = 'text-xl font-black text-white flex items-center gap-2';
    title.innerHTML = '👥 إدارة المشتركين';
    const subtitle = document.createElement('p');
    subtitle.className = 'text-xs text-slate-400';
    subtitle.textContent = 'سجل بيانات المشتركين والأمبيرات وعناوين الخطوط';
    titleGroup.appendChild(title);
    titleGroup.appendChild(subtitle);

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className =
      'min-h-[44px] px-4 py-2.5 rounded-xl bg-[#0E7490] hover:bg-cyan-600 text-white font-bold text-xs shadow-lg transition active:scale-95 cursor-pointer flex items-center justify-center gap-2';
    addBtn.innerHTML = '➕ إضافة مشترك جديد';
    addBtn.addEventListener('click', () => this.openSubscriberModal());

    header.appendChild(titleGroup);
    header.appendChild(addBtn);
    root.appendChild(header);

    // 2. Search & Filters Bar
    const filterSection = document.createElement('div');
    filterSection.className = 'flex flex-col sm:flex-row gap-2.5';

    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.placeholder = 'بحث بالاسم، رقم الهاتف، الزقاق أو المحلة...';
    searchInput.value = this.searchQuery;
    searchInput.className =
      'flex-1 min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:border-cyan-500';
    searchInput.addEventListener('input', (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value;
      this.loadSubscribers();
    });

    const filterGroup = document.createElement('div');
    filterGroup.className = 'flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0';

    const filters = ['الكل', 'نشط', 'مقطوع', 'معلق'];
    for (const f of filters) {
      const fBtn = document.createElement('button');
      fBtn.type = 'button';
      fBtn.className = `min-h-[38px] px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
        this.currentFilter === f
          ? 'bg-cyan-950 text-cyan-300 border border-cyan-700/60'
          : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 border border-transparent'
      }`;
      fBtn.textContent = f;
      fBtn.addEventListener('click', () => {
        this.currentFilter = f;
        this.loadSubscribers();
      });
      filterGroup.appendChild(fBtn);
    }

    filterSection.appendChild(searchInput);
    filterSection.appendChild(filterGroup);
    root.appendChild(filterSection);

    // 3. Stats Chips
    const statsContainer = document.createElement('div');
    statsContainer.id = 'subscribers-stats';
    statsContainer.className = 'grid grid-cols-3 gap-2.5 text-center text-xs';
    root.appendChild(statsContainer);

    // 4. List Container
    const listContainer = document.createElement('div');
    listContainer.id = 'subscribers-list';
    listContainer.className = 'space-y-3';
    root.appendChild(listContainer);

    this.container.appendChild(root);

    await this.loadSubscribers();
  }

  private async loadSubscribers(): Promise<void> {
    const listEl = document.getElementById('subscribers-list');
    const statsEl = document.getElementById('subscribers-stats');
    if (!listEl) return;

    listEl.innerHTML = '<div class="text-center py-8 text-slate-400 text-xs">جاري تحميل المشتركين...</div>';

    try {
      this.subscribers = await db.getSubscribers(this.searchQuery, this.currentFilter);

      // Render Stats
      if (statsEl) {
        const total = this.subscribers.length;
        const active = this.subscribers.filter((s) => s.lineStatus === 'نشط').length;
        const totalAmps = this.subscribers.reduce((sum, s) => sum + s.amperes, 0);

        statsEl.innerHTML = `
          <div class="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
            <span class="text-slate-400 block text-[10px]">المجموع</span>
            <span class="text-sm font-black text-white">${total} مشترك</span>
          </div>
          <div class="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
            <span class="text-emerald-400 block text-[10px]">النشطون</span>
            <span class="text-sm font-black text-emerald-400">${active} مشترك</span>
          </div>
          <div class="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
            <span class="text-cyan-400 block text-[10px]">الأمبيرية</span>
            <span class="text-sm font-black text-cyan-400">${totalAmps.toFixed(1)} أمبير</span>
          </div>
        `;
      }

      if (this.subscribers.length === 0) {
        listEl.innerHTML = `
          <div class="text-center py-12 rounded-2xl bg-slate-900/60 border border-slate-800 p-6 text-slate-400">
            <div class="text-3xl mb-2">🔍</div>
            <div class="text-sm font-bold text-slate-300">لا يوجد مشتركون مطابقون</div>
            <p class="text-xs text-slate-500 mt-1">جرّب تغيير كلمات البحث أو أضف مشتركاً جديداً</p>
          </div>
        `;
        return;
      }

      listEl.innerHTML = '';
      for (const sub of this.subscribers) {
        listEl.appendChild(this.createSubscriberCard(sub));
      }
    } catch (err: any) {
      listEl.innerHTML = `<div class="p-4 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs">خطأ: ${err.message}</div>`;
    }
  }

  private createSubscriberCard(sub: Subscriber): HTMLElement {
    const card = document.createElement('div');
    card.className =
      'p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs';

    const infoCol = document.createElement('div');
    infoCol.className = 'space-y-1.5 flex-1';

    // Name & badges
    const topRow = document.createElement('div');
    topRow.className = 'flex items-center gap-2 flex-wrap';

    const name = document.createElement('h4');
    name.className = 'text-sm font-black text-white';
    name.textContent = sub.fullName;
    topRow.appendChild(name);

    // Amperes badge
    const ampBadge = document.createElement('span');
    ampBadge.className = 'px-2 py-0.5 rounded-md bg-cyan-950 text-cyan-300 font-bold border border-cyan-800/60';
    ampBadge.textContent = `${sub.amperes} أمبير`;
    topRow.appendChild(ampBadge);

    // Line type badge
    const typeBadge = document.createElement('span');
    typeBadge.className = 'px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700';
    typeBadge.textContent = sub.lineType;
    topRow.appendChild(typeBadge);

    // Status badge
    const statusBadge = document.createElement('span');
    const statusColors: Record<LineStatus, string> = {
      نشط: 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60',
      مقطوع: 'bg-rose-950/60 text-rose-400 border-rose-800/60',
      معلق: 'bg-amber-950/60 text-amber-400 border-amber-800/60',
    };
    statusBadge.className = `px-2 py-0.5 rounded-md font-bold border ${statusColors[sub.lineStatus] || ''}`;
    statusBadge.textContent = sub.lineStatus;
    topRow.appendChild(statusBadge);

    infoCol.appendChild(topRow);

    // Address & Phone
    const detailRow = document.createElement('div');
    detailRow.className = 'flex items-center gap-3 text-slate-400 text-[11px] flex-wrap';

    if (sub.phone) {
      const phoneSpan = document.createElement('span');
      phoneSpan.innerHTML = `📞 ${sub.phone}`;
      detailRow.appendChild(phoneSpan);
    }

    const addrParts = [sub.area, sub.neighborhood ? `م ${sub.neighborhood}` : '', sub.alley ? `ز ${sub.alley}` : '', sub.houseNumber ? `دار ${sub.houseNumber}` : ''].filter(Boolean);
    if (addrParts.length > 0) {
      const addrSpan = document.createElement('span');
      addrSpan.innerHTML = `📍 ${addrParts.join(' / ')}`;
      detailRow.appendChild(addrSpan);
    }

    if (sub.notes) {
      const notesSpan = document.createElement('span');
      notesSpan.className = 'text-slate-500 italic';
      notesSpan.textContent = `📝 ${sub.notes}`;
      detailRow.appendChild(notesSpan);
    }

    infoCol.appendChild(detailRow);
    card.appendChild(infoCol);

    // Actions
    const actionsRow = document.createElement('div');
    actionsRow.className = 'flex items-center gap-1.5 self-end sm:self-center shrink-0';

    if (sub.phone) {
      const callBtn = document.createElement('a');
      callBtn.href = `tel:${sub.phone}`;
      callBtn.className =
        'min-h-[38px] px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 font-bold transition flex items-center gap-1';
      callBtn.innerHTML = '📞';
      callBtn.title = 'اتصال';
      actionsRow.appendChild(callBtn);

      const waBtn = document.createElement('a');
      const cleanPhone = sub.phone.replace(/^0/, '964').replace(/\D/g, '');
      waBtn.href = `https://wa.me/${cleanPhone}`;
      waBtn.target = '_blank';
      waBtn.className =
        'min-h-[38px] px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 font-bold transition flex items-center gap-1';
      waBtn.innerHTML = '💬';
      waBtn.title = 'واتساب';
      actionsRow.appendChild(waBtn);
    }

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className =
      'min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium transition cursor-pointer';
    editBtn.textContent = 'تعديل';
    editBtn.addEventListener('click', () => this.openSubscriberModal(sub));
    actionsRow.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className =
      'min-h-[38px] px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-950/60 text-rose-400 border border-slate-700 hover:border-rose-800 font-bold transition cursor-pointer';
    deleteBtn.innerHTML = '🗑️';
    deleteBtn.title = 'حذف المشترك';
    deleteBtn.addEventListener('click', async () => {
      if (confirm(`هل أنت متأكد من حذف المشترك «${sub.fullName}»؟ سيتم حذف جميع وصولاته نهائياً.`)) {
        await db.deleteSubscriber(sub.id);
        await this.loadSubscribers();
      }
    });
    actionsRow.appendChild(deleteBtn);

    card.appendChild(actionsRow);
    return card;
  }

  private async openSubscriberModal(sub?: Subscriber): Promise<void> {
    this.editingSubscriber = sub || null;

    // Check License / Trial status before allowing new additions
    if (!sub) {
      const settings = await db.getSettings();
      const licStatus = await licenseManager.getStatus(settings);
      if (!licStatus.canAddRecords) {
        alert(
          'انتهت الفترة التجريبية المجانية (30 يوماً). تم قفل إضافة مشتركين جدد. يمكنك استعراض كافة السجلات وطباعة الوصولات وتصدير البيانات في أي وقت. لتفعيل النظام يُرجى إدخال كود الترخيص من شاشة الإعدادات.'
        );
        return;
      }
    }

    this.closeModal();

    this.modalElement = document.createElement('div');
    this.modalElement.className =
      'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto';

    const card = document.createElement('div');
    card.className =
      'w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-700 p-6 shadow-2xl text-slate-100 flex flex-col gap-4 my-8';

    const header = document.createElement('div');
    header.className = 'flex items-center justify-between border-b border-slate-800 pb-3';

    const title = document.createElement('h3');
    title.className = 'text-base font-black text-cyan-400';
    title.textContent = sub ? '✏️ تعديل بيانات مشترك' : '➕ إضافة مشترك جديد';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'text-slate-400 hover:text-white p-1 text-xl leading-none cursor-pointer';
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', () => this.closeModal());

    header.appendChild(title);
    header.appendChild(closeBtn);
    card.appendChild(header);

    // Form
    const form = document.createElement('form');
    form.className = 'space-y-3.5 text-xs';
    form.innerHTML = `
      <div>
        <label class="block text-slate-300 font-bold mb-1">الاسم الكامل <span class="text-rose-400">*</span></label>
        <input type="text" id="sub-name" required value="${sub?.fullName || ''}" placeholder="اسم المشترك الثلاثي"
          class="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 focus:border-cyan-500 focus:outline-none text-sm" />
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="block text-slate-300 font-bold mb-1">رقم الهاتف</label>
          <input type="tel" id="sub-phone" value="${sub?.phone || ''}" placeholder="077XXXXXXXX"
            class="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 focus:border-cyan-500 focus:outline-none text-sm" />
        </div>
        <div>
          <label class="block text-slate-300 font-bold mb-1">عدد الأمبيرات <span class="text-rose-400">*</span></label>
          <input type="number" id="sub-amperes" step="0.5" min="0.5" required value="${sub?.amperes || 1}"
            class="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 focus:border-cyan-500 focus:outline-none text-sm" />
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="block text-slate-300 font-bold mb-1">نوع الخط</label>
          <select id="sub-line-type" class="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 focus:border-cyan-500 focus:outline-none text-sm">
            <option value="عادي" ${sub?.lineType === 'عادي' ? 'selected' : ''}>عادي</option>
            <option value="ذهبي" ${sub?.lineType === 'ذهبي' ? 'selected' : ''}>ذهبي</option>
            <option value="ليلي" ${sub?.lineType === 'ليلي' ? 'selected' : ''}>ليلي</option>
            <option value="صباحي" ${sub?.lineType === 'صباحي' ? 'selected' : ''}>صباحي</option>
          </select>
        </div>
        <div>
          <label class="block text-slate-300 font-bold mb-1">حالة الخط</label>
          <select id="sub-line-status" class="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 focus:border-cyan-500 focus:outline-none text-sm">
            <option value="نشط" ${sub?.lineStatus === 'نشط' ? 'selected' : ''}>نشط</option>
            <option value="مقطوع" ${sub?.lineStatus === 'مقطوع' ? 'selected' : ''}>مقطوع</option>
            <option value="معلق" ${sub?.lineStatus === 'معلق' ? 'selected' : ''}>معلق</option>
          </select>
        </div>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div>
          <label class="block text-slate-400 mb-1">المنطقة</label>
          <input type="text" id="sub-area" value="${sub?.area || ''}" placeholder="حي السلام"
            class="w-full min-h-[40px] px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-xs" />
        </div>
        <div>
          <label class="block text-slate-400 mb-1">المحلة</label>
          <input type="text" id="sub-neighborhood" value="${sub?.neighborhood || ''}" placeholder="605"
            class="w-full min-h-[40px] px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-xs" />
        </div>
        <div>
          <label class="block text-slate-400 mb-1">الزقاق</label>
          <input type="text" id="sub-alley" value="${sub?.alley || ''}" placeholder="12"
            class="w-full min-h-[40px] px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-xs" />
        </div>
        <div>
          <label class="block text-slate-400 mb-1">رقم الدار</label>
          <input type="text" id="sub-house" value="${sub?.houseNumber || ''}" placeholder="8"
            class="w-full min-h-[40px] px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-xs" />
        </div>
      </div>

      <div>
        <label class="block text-slate-300 font-bold mb-1">ملاحظات إضافية</label>
        <textarea id="sub-notes" rows="2" placeholder="ملاحظات حول القاطع، الموقع، أو تفضيلات المشترك..."
          class="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-xs focus:border-cyan-500 focus:outline-none">${sub?.notes || ''}</textarea>
      </div>

      <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
        <button type="button" id="modal-cancel-btn"
          class="min-h-[44px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer">
          إلغاء
        </button>
        <button type="submit"
          class="min-h-[44px] px-6 py-2 rounded-xl bg-[#0E7490] hover:bg-cyan-600 text-white font-bold shadow-lg shadow-cyan-950 transition active:scale-95 cursor-pointer">
          ${sub ? 'حفظ التعديلات' : 'إضافة المشترك'}
        </button>
      </div>
    `;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const nameVal = (document.getElementById('sub-name') as HTMLInputElement).value;
      const phoneVal = (document.getElementById('sub-phone') as HTMLInputElement).value;
      const ampsVal = parseFloat((document.getElementById('sub-amperes') as HTMLInputElement).value);
      const lineTypeVal = (document.getElementById('sub-line-type') as HTMLSelectElement).value as LineType;
      const lineStatusVal = (document.getElementById('sub-line-status') as HTMLSelectElement).value as LineStatus;
      const areaVal = (document.getElementById('sub-area') as HTMLInputElement).value;
      const neighVal = (document.getElementById('sub-neighborhood') as HTMLInputElement).value;
      const alleyVal = (document.getElementById('sub-alley') as HTMLInputElement).value;
      const houseVal = (document.getElementById('sub-house') as HTMLInputElement).value;
      const notesVal = (document.getElementById('sub-notes') as HTMLTextAreaElement).value;

      try {
        if (this.editingSubscriber) {
          await db.updateSubscriber(this.editingSubscriber.id, {
            fullName: nameVal,
            phone: phoneVal,
            amperes: ampsVal,
            lineType: lineTypeVal,
            lineStatus: lineStatusVal,
            area: areaVal,
            neighborhood: neighVal,
            alley: alleyVal,
            houseNumber: houseVal,
            notes: notesVal,
          });
        } else {
          await db.addSubscriber({
            fullName: nameVal,
            phone: phoneVal,
            amperes: ampsVal,
            lineType: lineTypeVal,
            lineStatus: lineStatusVal,
            area: areaVal,
            neighborhood: neighVal,
            alley: alleyVal,
            houseNumber: houseVal,
            notes: notesVal,
          });
        }

        this.closeModal();
        await this.loadSubscribers();
      } catch (err: any) {
        alert(`فشل الحفظ: ${err.message}`);
      }
    });

    const cancelBtn = form.querySelector('#modal-cancel-btn');
    cancelBtn?.addEventListener('click', () => this.closeModal());

    card.appendChild(form);
    this.modalElement.appendChild(card);
    document.body.appendChild(this.modalElement);
  }

  private closeModal(): void {
    if (this.modalElement && this.modalElement.parentElement) {
      this.modalElement.parentElement.removeChild(this.modalElement);
      this.modalElement = null;
    }
  }
}
