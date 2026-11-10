/**
 * src/ui/components/LicenseLockModal.ts
 * Modal shown when the application/workspace is expired, locked, or unlicensed.
 * Provides instant contact with the owner/developer via WhatsApp (pre-filled message) or Direct Call (07764271130).
 * Mobile-First Vanilla TypeScript
 */

import { APP_CONFIG } from '../../config/app-config.ts';
import { escapeHtml } from '../../utils/security.ts';
import type { Entitlement } from '../../services/entitlementService.ts';

export interface LicenseLockModalOptions {
  entitlement?: Entitlement | null;
  actionName?: string;
}

export class LicenseLockModal {
  private element: HTMLElement | null = null;

  public show(options?: LicenseLockModalOptions): void {
    this.close();

    const tenant = options?.entitlement?.tenant;
    const generatorName = tenant?.name || 'مولدتي الأهلية';
    const ownerName = tenant?.ownerName || 'صاحب المولدة';
    const ownerPhone = tenant?.phone || '';
    const actionDesc = options?.actionName ? `إجراء «${options.actionName}»` : 'إضافة سجلات جديدة';

    const waText = `السلام عليكم ورحمة الله،
أود تفعيل / تجديد ترخيص منظومة أمبيرجي لإدارة المولدات:
• اسم المولدة: ${generatorName}
• صاحب المولدة: ${ownerName}
${ownerPhone ? `• رقم هاتف المولدة: ${ownerPhone}\n` : ''}• نوع التفعيل المطلوب: (سنوي / دائمي)`;

    const whatsappUrl = `https://wa.me/${APP_CONFIG.support.whatsapp}?text=${encodeURIComponent(waText)}`;
    const phoneUrl = `tel:${APP_CONFIG.support.phone}`;

    this.element = document.createElement('div');
    this.element.id = 'license-lock-modal';
    this.element.className =
      'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto';

    const card = document.createElement('div');
    card.className =
      'w-full max-w-lg rounded-3xl bg-slate-900 border border-rose-900/60 p-6 shadow-2xl text-slate-100 flex flex-col gap-4 my-8';

    card.innerHTML = `
      <!-- Header -->
      <div class="flex items-start justify-between border-b border-slate-800 pb-3">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-2xl bg-rose-950/80 border border-rose-800/80 flex items-center justify-center text-2xl shrink-0">
            🔒
          </div>
          <div>
            <h3 class="text-base font-black text-rose-300">انتهت صلاحية استخدام المنظومة</h3>
            <p class="text-xs text-slate-400 mt-0.5">يتطلب تفعيل المنظومة لمتابعة ${escapeHtml(actionDesc)}</p>
          </div>
        </div>
        <button type="button" id="lock-modal-close" class="text-slate-400 hover:text-white p-1 text-2xl leading-none cursor-pointer">
          &times;
        </button>
      </div>

      <!-- Info Box -->
      <div class="p-3.5 rounded-2xl bg-slate-800/60 border border-slate-700/60 space-y-2 text-xs">
        <div class="flex items-center justify-between text-slate-300">
          <span>المولدة: <strong class="text-white">${escapeHtml(generatorName)}</strong></span>
          <span>المسؤول: <strong class="text-white">${escapeHtml(ownerName)}</strong></span>
        </div>
        <p class="text-slate-300 leading-relaxed">
          جميع بياناتك ومشتركيك وقوائمك المالية <strong>محفوظة بالكامل ومحمية</strong>، ويمكنك استعراضها وطباعتها وتصديرها.
          ولكن إضافة سجلات جديدة أو إصدار قوائم تتطلب تفعيل الاشتراك.
        </p>
      </div>

      <!-- Plans Available -->
      <div class="space-y-1.5 text-xs">
        <div class="font-bold text-slate-200">خيارات التفعيل المتاحة لدى إدارة المنظومة:</div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div class="p-3 rounded-xl bg-cyan-950/40 border border-cyan-800/50 flex items-center gap-2.5">
            <span class="text-2xl">🛡️</span>
            <div>
              <div class="font-bold text-cyan-300">اشتراك سنوي</div>
              <div class="text-[11px] text-slate-400">سنة كاملة (365 يوماً) مع التحديثات</div>
            </div>
          </div>
          <div class="p-3 rounded-xl bg-purple-950/40 border border-purple-800/50 flex items-center gap-2.5">
            <span class="text-2xl">👑</span>
            <div>
              <div class="font-bold text-purple-300">ترخيص دائمي</div>
              <div class="text-[11px] text-slate-400">تفعيل مدى الحياة بدون تجديد سنوي</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Contact Buttons -->
      <div class="pt-2 border-t border-slate-800 space-y-2.5">
        <div class="text-[11px] text-slate-400 font-bold">تواصل فوراً مع صاحب التطبيق لإصدار كود التفعيل:</div>
        <div class="flex flex-col sm:flex-row gap-2">
          <a href="${whatsappUrl}" target="_blank" rel="noopener noreferrer"
            class="flex-1 min-h-[46px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/50 transition active:scale-95 flex items-center justify-center gap-2 no-underline cursor-pointer">
            <span class="text-base">💬</span>
            <span>تواصل عبر واتساب (رسالة جاهزة)</span>
          </a>
          <a href="${phoneUrl}"
            class="min-h-[46px] px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-600 text-white font-bold text-xs shadow-lg shadow-blue-950/50 transition active:scale-95 flex items-center justify-center gap-2 no-underline cursor-pointer">
            <span class="text-base">📞</span>
            <span>اتصال: ${escapeHtml(APP_CONFIG.support.phone)}</span>
          </a>
        </div>
      </div>

      <!-- Secondary: Enter Key or Close -->
      <div class="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
        <button type="button" id="lock-modal-enter-key"
          class="text-cyan-400 hover:text-cyan-300 font-bold cursor-pointer underline flex items-center gap-1">
          <span>⚙️ لدي كود ترخيص مسبقاً (إدخال الكود)</span>
        </button>
        <button type="button" id="lock-modal-cancel"
          class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer">
          متابعة الاستعراض فقط
        </button>
      </div>
    `;

    card.querySelector('#lock-modal-close')?.addEventListener('click', () => this.close());
    card.querySelector('#lock-modal-cancel')?.addEventListener('click', () => this.close());
    card.querySelector('#lock-modal-enter-key')?.addEventListener('click', () => {
      this.close();
      window.location.hash = '#settings';
    });

    this.element.appendChild(card);
    document.body.appendChild(this.element);
  }

  public close(): void {
    if (this.element && this.element.isConnected) {
      this.element.remove();
    }
    this.element = null;
  }
}

export const licenseLockModal = new LicenseLockModal();
