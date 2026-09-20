/**
 * محرك دعم الطباعة الحرارية العربية (ESC/POS Arabic Engine)
 * يتضمن:
 * 1. إعادة تشكيل الحروف العربية (Arabic Reshaping) ودمج الحروف المتصلة.
 * 2. إعادة ترتيب الاتجاه (BiDi Reordering) لتوافق طابعات الـ LTR.
 * 3. تصيير الوصل إلى صورة نقطية بيضاء وسوداء (1-Bit Monochrome Raster Canvas)
 *    وهو الحل الأضمن بنسبة 100% لكافة طابعات البلوتوث الصينية في السوق العراقي.
 */

import type { Subscriber, Payment, TenantSettings } from '../types';
import { formatIQD } from '../services/billingService';

// جدول أشكال الحروف العربية في يونيكود (Isolated, Final, Initial, Medial)
const ARABIC_GLYPHS: Record<number, [number, number, number, number]> = {
  0x0621: [0xfe80, 0xfe80, 0xfe80, 0xfe80], // ء
  0x0622: [0xfe81, 0xfe82, 0xfe81, 0xfe82], // آ
  0x0623: [0xfe83, 0xfe84, 0xfe83, 0xfe84], // أ
  0x0624: [0xfe85, 0xfe86, 0xfe85, 0xfe86], // ؤ
  0x0625: [0xfe87, 0xfe88, 0xfe87, 0xfe88], // إ
  0x0626: [0xfe89, 0xfe8a, 0xfe8b, 0xfe8c], // ئ
  0x0627: [0xfe8d, 0xfe8e, 0xfe8d, 0xfe8e], // ا
  0x0628: [0xfe8f, 0xfe90, 0xfe91, 0xfe92], // ب
  0x0629: [0xfe93, 0xfe94, 0xfe93, 0xfe94], // ة
  0x062a: [0xfe95, 0xfe96, 0xfe97, 0xfe98], // ت
  0x062b: [0xfe99, 0xfe9a, 0xfe9b, 0xfe9c], // ث
  0x062c: [0xfe9d, 0xfe9e, 0xfe9f, 0xfea0], // ج
  0x062d: [0xfea1, 0xfea2, 0xfea3, 0xfea4], // ح
  0x062e: [0xfea5, 0xfea6, 0xfea7, 0xfea8], // خ
  0x062f: [0xfea9, 0xfeaa, 0xfea9, 0xfeaa], // د
  0x0630: [0xfeab, 0xfeac, 0xfeab, 0xfeac], // ذ
  0x0631: [0xfead, 0xfeae, 0xfead, 0xfeae], // ر
  0x0632: [0xfeaf, 0xfeb0, 0xfeaf, 0xfeb0], // ز
  0x0633: [0xfeb1, 0xfeb2, 0xfeb3, 0xfeb4], // س
  0x0634: [0xfeb5, 0xfeb6, 0xfeb7, 0xfeb8], // ش
  0x0635: [0xfeb9, 0xfeba, 0xfebb, 0xfebc], // ص
  0x0636: [0xfebd, 0xfebe, 0xfebf, 0xfec0], // ض
  0x0637: [0xfec1, 0xfec2, 0xfec3, 0xfec4], // ط
  0x0638: [0xFEC5, 0xFEC6, 0xFEC7, 0xFEC8], // ظ
  0x0639: [0xFEC9, 0xFECA, 0xFECB, 0xFECC], // ع
  0x063a: [0xFECD, 0xFECE, 0xFECF, 0xFED0], // غ
  0x0641: [0xFED1, 0xFED2, 0xFED3, 0xFED4], // ف
  0x0642: [0xFED5, 0xFED6, 0xFED7, 0xFED8], // ق
  0x0643: [0xFED9, 0xFEDA, 0xFEDB, 0xFEDC], // ك
  0x0644: [0xFEDD, 0xFEDE, 0xFEDF, 0xFEE0], // ل
  0x0645: [0xFEE1, 0xFEE2, 0xFEE3, 0xFEE4], // م
  0x0646: [0xFEE5, 0xFEE6, 0xFEE7, 0xFEE8], // ن
  0x0647: [0xFEE9, 0xFEEA, 0xFEEB, 0xFEEC], // ه
  0x0648: [0xFEED, 0xFEEE, 0xFEED, 0xFEEE], // و
  0x0649: [0xFEEF, 0xFEF0, 0xFEEF, 0xFEF0], // ى
  0x064A: [0xFEF1, 0xFEF2, 0xFEF3, 0xFEF4], // ي
  0x067E: [0xFB56, 0xFB57, 0xFB58, 0xFB59], // پ
  0x0686: [0xFB7A, 0xFB7B, 0xFB7C, 0xFB7D], // چ
  0x0698: [0xFB8A, 0xFB8B, 0xFB8A, 0xFB8B], // ژ
  0x06AF: [0xFB92, 0xFB93, 0xFB94, 0xFB95], // گ
};

// الحروف التي لا تتصل بما بعدها (فقط تتصل بما قبلها)
const NON_CONNECTING_AFTER = new Set([
  0x0621, 0x0622, 0x0623, 0x0624, 0x0625, 0x0627, 0x062F, 0x0630, 0x0631, 0x0632,
  0x0648, 0x0649, 0x0629, 0x0698,
]);

function isArabicChar(code: number): boolean {
  return (code >= 0x0600 && code <= 0x06ff) || (code >= 0xfb50 && code <= 0xfdff);
}

function handleLamAlef(chars: number[]): number[] {
  const result: number[] = [];
  for (let i = 0; i < chars.length; i++) {
    const cur = chars[i];
    const next = i + 1 < chars.length ? chars[i + 1] : 0;
    if (cur === 0x0644) {
      if (next === 0x0622) { result.push(0xfef5); i++; continue; } // لآ
      if (next === 0x0623) { result.push(0xfef7); i++; continue; } // لأ
      if (next === 0x0625) { result.push(0xfef9); i++; continue; } // لإ
      if (next === 0x0627) { result.push(0xfefb); i++; continue; } // لا
    }
    result.push(cur);
  }
  return result;
}

/**
 * إعادة تشكيل الكلمات العربية لحروف متصلة (Arabic Reshaper)
 */
export function reshapeArabic(text: string): string {
  if (!text) return '';
  const rawCodes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    rawCodes.push(text.charCodeAt(i));
  }

  const codes = handleLamAlef(rawCodes);
  const result: string[] = [];

  for (let i = 0; i < codes.length; i++) {
    const cur = codes[i];
    const glyphs = ARABIC_GLYPHS[cur];

    if (!glyphs) {
      result.push(String.fromCharCode(cur));
      continue;
    }

    const prev = i > 0 ? codes[i - 1] : 0;
    const next = i + 1 < codes.length ? codes[i + 1] : 0;

    const connectsWithPrev = prev && isArabicChar(prev) && !NON_CONNECTING_AFTER.has(prev);
    const connectsWithNext = next && isArabicChar(next) && ARABIC_GLYPHS[next];

    let form = 0; // Isolated
    if (connectsWithPrev && connectsWithNext && !NON_CONNECTING_AFTER.has(cur)) {
      form = 3; // Medial
    } else if (connectsWithPrev) {
      form = 1; // Final
    } else if (connectsWithNext && !NON_CONNECTING_AFTER.has(cur)) {
      form = 2; // Initial
    }

    result.push(String.fromCharCode(glyphs[form]));
  }

  return result.join('');
}

/**
 * معالجة اتجاه السطر للطابعة الحرارية (BiDi Reordering)
 * تعكس ترتيب الحروف العربية ليطبعها رأس الطابعة من اليمين لليسار، مع إبقاء الأرقام سليمة
 */
export function processLineForThermal(line: string): string {
  const reshaped = reshapeArabic(line);
  const reversed = reshaped.split('').reverse().join('');
  return reversed.replace(/([0-9a-zA-Z\.\:\/\-]+)/g, (match) => {
    return match.split('').reverse().join('');
  });
}

/**
 * تصيير وصل القبض إلى Canvas 2D ثم تحويله إلى صورة نقطية (Monochrome 1-Bit ESC/POS Raster)
 * عرض الطابعة 58mm القياسي = 384 نقطة (Dots)
 */
export function renderReceiptToCanvas(
  subscriber: Subscriber,
  payment: Payment,
  remainingDebt: number,
  settings?: TenantSettings,
  width: number = 384
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('تعذر إنشاء سياق رسم الـ Canvas');

  const estimatedHeight = 650;
  canvas.width = width;
  canvas.height = estimatedHeight;

  // خلفية بيضاء نقية
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#000000';
  ctx.direction = 'rtl';

  let y = 32;
  const centerX = width / 2;
  const rightX = width - 15;
  const leftX = 15;

  // 1. الترويسة
  const generatorName = settings?.generatorName || 'إدارة المولدة الأهلية';
  const ownerPhone = settings?.phone || '';

  ctx.font = 'bold 20px "Segoe UI", Tahoma, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(generatorName, centerX, y);
  y += 24;

  if (ownerPhone) {
    ctx.font = '14px "Segoe UI", Tahoma, Arial, sans-serif';
    ctx.fillText(`هاتف الشكاوى: ${ownerPhone}`, centerX, y);
    y += 20;
  }

  ctx.font = 'bold 16px "Segoe UI", Tahoma, Arial, sans-serif';
  ctx.fillText('*** وصل قبض كهرباء أهلية ***', centerX, y);
  y += 18;

  // خط فاصل منقط
  drawDashedLine(ctx, leftX, y, rightX, y);
  y += 22;

  // 2. بيانات السند والمشترك
  const dateFormatted = new Date(payment.paymentDate).toLocaleDateString('ar-IQ', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const fields: [string, string][] = [
    ['رقم السند:', payment.receiptNumber || 'REC-0000'],
    ['التاريخ:', dateFormatted],
    ['المشترك:', subscriber.fullName],
    ['العنوان:', subscriber.street || 'غير محدد'],
    ['رقم القاطع:', subscriber.breakerNumber || 'غير محدد'],
    ['الأمبيرات:', `${subscriber.amperes} أمبير`],
  ];

  ctx.font = '15px "Segoe UI", Tahoma, Arial, sans-serif';
  for (const [label, val] of fields) {
    ctx.textAlign = 'right';
    ctx.fillText(label, rightX, y);
    ctx.textAlign = 'left';
    ctx.fillText(val, leftX, y);
    y += 25;
  }

  // خط فاصل
  drawDashedLine(ctx, leftX, y, rightX, y);
  y += 25;

  // 3. المبالغ المالية بخط بارز
  ctx.textAlign = 'right';
  ctx.font = 'bold 17px "Segoe UI", Tahoma, Arial, sans-serif';
  ctx.fillText('المبلغ الواصل:', rightX, y);
  ctx.textAlign = 'left';
  ctx.fillText(formatIQD(payment.amount), leftX, y);
  y += 28;

  ctx.textAlign = 'right';
  ctx.font = 'bold 15px "Segoe UI", Tahoma, Arial, sans-serif';
  ctx.fillText('المتبقي بذمته:', rightX, y);
  ctx.textAlign = 'left';
  ctx.fillText(remainingDebt > 0 ? formatIQD(remainingDebt) : '0 د.ع (خالص)', leftX, y);
  y += 25;

  if (payment.notes) {
    ctx.textAlign = 'right';
    ctx.font = '13px "Segoe UI", Tahoma, Arial, sans-serif';
    ctx.fillText(`ملاحظة: ${payment.notes}`, rightX, y);
    y += 22;
  }

  // خط فاصل نهائي
  drawDashedLine(ctx, leftX, y, rightX, y);
  y += 24;

  // 4. التذييل
  ctx.textAlign = 'center';
  ctx.font = '14px "Segoe UI", Tahoma, Arial, sans-serif';
  ctx.fillText(`المحصل: ${payment.collectorName}`, centerX, y);
  y += 22;
  ctx.font = 'bold 13px "Segoe UI", Tahoma, Arial, sans-serif';
  ctx.fillText('شكراً لالتزامكم بالتسديد الشهري', centerX, y);
  y += 40;

  // ضبط الارتفاع الفعلي بدقة
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = width;
  finalCanvas.height = y;
  const finalCtx = finalCanvas.getContext('2d');
  if (finalCtx) {
    finalCtx.drawImage(canvas, 0, 0);
  }

  return finalCanvas;
}

function drawDashedLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.save();
  ctx.beginPath();
  ctx.setLineDash([4, 4]);
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

/**
 * تحويل الـ Canvas إلى مصفوفة أوامر ESC/POS للطباعة النقطية (GS v 0 Raster Bit Image)
 * متوافقة 100% مع كافة طابعات الـ 58mm / 80mm
 */
export function canvasToEscPosRaster(canvas: HTMLCanvasElement): Uint8Array {
  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('لا يمكن قراءة بكسلات الـ Canvas');

  const imgData = ctx.getImageData(0, 0, width, height);
  const pixels = imgData.data;

  const widthBytes = Math.ceil(width / 8);
  const rasterData: number[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < widthBytes; x++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const pxX = x * 8 + bit;
        if (pxX < width) {
          const idx = (y * width + pxX) * 4;
          const r = pixels[idx];
          const g = pixels[idx + 1];
          const b = pixels[idx + 2];
          const gray = 0.299 * r + 0.587 * g + 0.114 * b;
          if (gray < 160) {
            byte |= 1 << (7 - bit);
          }
        }
      }
      rasterData.push(byte);
    }
  }

  const commands: number[] = [];
  commands.push(0x1b, 0x40); // Init

  const xL = widthBytes % 256;
  const xH = Math.floor(widthBytes / 256);
  const yL = height % 256;
  const yH = Math.floor(height / 256);

  commands.push(0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH);
  for (let i = 0; i < rasterData.length; i++) {
    commands.push(rasterData[i]);
  }

  commands.push(0x1b, 0x64, 0x04); // Feed 4 lines
  commands.push(0x1d, 0x56, 0x42, 0x00); // Partial cut

  return new Uint8Array(commands);
}
