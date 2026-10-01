/**
 * src/ui/components/RegisterTenantModal.ts
 * Modal for Onboarding and Registering New Generator Owners (Tenants)
 * Mobile-First Vanilla TypeScript
 */

import { db } from '../../db/database.ts';
import type { TenantOnboardingInput } from '../../types/index.ts';

export class RegisterTenantModal {
  private element: HTMLElement | null = null;
  private onSuccessCallback: (() => void) | null = null;

  constructor() {}

  public show(onSuccess?: () => void): void {
    this.close();
    this.onSuccessCallback = onSuccess || null;

    this.element = document.createElement('div');
    this.element.id = 'register-tenant-modal';
    this.element.className =
      'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto';

    const card = document.createElement('div');
    card.className =
      'w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-700 p-6 shadow-2xl text-slate-100 flex flex-col gap-4 my-8';

    // Header
    const header = document.createElement('div');
    header.className = 'flex items-center justify-between border-b border-slate-800 pb-3';

    const titleGroup = document.createElement('div');
    const title = document.createElement('h3');
    title.className = 'text-lg font-black text-cyan-400 flex items-center gap-2';
    title.innerHTML = '⚡ تسجيل صاحب مولدة جديد';
    const sub = document.createElement('p');
    sub.className = 'text-xs text-slate-400 mt-0.5';
    sub.textContent = 'انضم لمنظومة أمبيرجي واحصل على شهر تجريبي مجاناً بكامل المزايا';
    titleGroup.appendChild(title);
    titleGroup.appendChild(sub);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'text-slate-400 hover:text-white p-1 text-xl leading-none cursor-pointer';
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', () => this.close());

    header.appendChild(titleGroup);
    header.appendChild(closeBtn);
    card.appendChild(header);

    // Form
    const form = document.createElement('form');
    form.className = 'space-y-3.5 text-xs';
    form.innerHTML = `
      <div>
        <label class="block text-slate-300 font-bold mb-1">اسم صاحب المولدة (المالك / المتعهد) <span class="text-rose-400">*</span></label>
        <input type="text" id="reg-owner-name" required placeholder="مثال: أبو كرار المنصوري"
          class="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:border-cyan-500 focus:outline-none" />
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="block text-slate-300 font-bold mb-1">رقم هاتف المالك <span class="text-rose-400">*</span></label>
          <input type="tel" id="reg-phone" required placeholder="077XXXXXXXX أو 078XXXXXXXX"
            class="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:border-cyan-500 focus:outline-none font-mono" />
        </div>
        <div>
          <label class="block text-slate-300 font-bold mb-1">اسم المولدة <span class="text-rose-400">*</span></label>
          <input type="text" id="reg-gen-name" required placeholder="مثال: مولدة القدس المركزية"
            class="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:border-cyan-500 focus:outline-none" />
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="block text-slate-300 font-bold mb-1">المحافظة والمنطقة <span class="text-rose-400">*</span></label>
          <input type="text" id="reg-address" required placeholder="مثال: بغداد - المنصور - شارع 14 رمضان"
            class="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:border-cyan-500 focus:outline-none" />
        </div>
        <div>
          <label class="block text-slate-300 font-bold mb-1">تسعيرة الأمبير الافتراضية (د.ع)</label>
          <input type="number" id="reg-default-price" min="1000" step="500" value="12000"
            class="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:border-cyan-500 focus:outline-none font-bold text-cyan-300" />
        </div>
      </div>

      <!-- Plan Perk Badge -->
      <div class="p-3.5 rounded-2xl bg-cyan-950/40 border border-cyan-800/50 flex items-start gap-3">
        <div class="text-2xl">🎁</div>
        <div>
          <div class="font-bold text-cyan-300 text-xs">عرض الانضمام التلقائي (30 يوماً مجاناً)</div>
          <p class="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
            يتم تفعيل فترة تجربة مجانية كاملة المزايا فوراً لمدة شهر، تتيح تسجيل المشتركين وإصدار الوصولات وإدارة الوقود بدون أي رسوم.
          </p>
        </div>
      </div>

      <div class="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
        <button type="button" id="reg-cancel-btn"
          class="min-h-[44px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer">
          إلغاء
        </button>
        <button type="submit"
          class="min-h-[44px] px-6 py-2 rounded-xl bg-[#0E7490] hover:bg-cyan-600 text-white font-bold shadow-lg shadow-cyan-950 transition active:scale-95 cursor-pointer flex items-center gap-2">
          <span>تسجيل المولدة وبدء الاستخدام</span>
          <span>🚀</span>
        </button>
      </div>
    `;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const ownerName = (document.getElementById('reg-owner-name') as HTMLInputElement).value;
      const phone = (document.getElementById('reg-phone') as HTMLInputElement).value;
      const genName = (document.getElementById('reg-gen-name') as HTMLInputElement).value;
      const address = (document.getElementById('reg-address') as HTMLInputElement).value;
      const defaultPrice = parseFloat((document.getElementById('reg-default-price') as HTMLInputElement).value) || 12000;

      const input: TenantOnboardingInput = {
        name: genName,
        ownerName,
        phone,
        address,
        defaultPrice,
        plan: 'trial',
      };

      try {
        const newTenant = await db.addTenant(input);
        this.close();

        const doSwitch = confirm(
          `🎉 تم تسجيل «${newTenant.name}» بنجاح في المنظومة!\nصاحب المولدة: ${newTenant.ownerName}\nفترة التجربة: 30 يوماً مجاناً.\n\nهل ترغب بالتبديل الآن إلى لوحة إدارة هذه المولدة؟`
        );

        if (doSwitch) {
          await db.setCurrentTenant(newTenant.id);
        }

        if (this.onSuccessCallback) {
          this.onSuccessCallback();
        }
      } catch (err: any) {
        alert(`فشل التسجيل: ${err.message}`);
      }
    });

    form.querySelector('#reg-cancel-btn')?.addEventListener('click', () => this.close());

    card.appendChild(form);
    this.element.appendChild(card);
    document.body.appendChild(this.element);
  }

  public close(): void {
    if (this.element && this.element.parentElement) {
      this.element.parentElement.removeChild(this.element);
      this.element = null;
    }
  }
}

export const registerTenantModal = new RegisterTenantModal();
