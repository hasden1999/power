// خدمة الطباعة الحرارية المباشرة عبر البلوتوث (Web Bluetooth ESC/POS)
import type { Subscriber, Payment, TenantSettings } from '../types';
import { formatIQD } from './billingService';

// تعريف أنواع Web Bluetooth للمتصفح إذا لم تكن مضمنة في TypeScript
declare global {
  interface Navigator {
    bluetooth?: {
      requestDevice(options: any): Promise<any>;
    };
  }
}

class BluetoothPrinterService {
  private device: any = null;
  private characteristic: any = null;

  // التحقق من دعم المتصفح للبلوتوث
  isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  // الاتصال بطابعة البلوتوث الحرارية
  async connect(): Promise<boolean> {
    if (!this.isSupported()) {
      throw new Error('ميزة بلوتوث المتصفح (Web Bluetooth) تشترط الدخول عبر رابط HTTPS مشفر (مثل https://192.168.0.112:5173). للتجاوز الفوري: يمكنك الضغط على زر "طباعة النظام (حرارية)" المتاح فوراً بدون أي قيود.');
    }


    try {
      // البحث عن الطابعة الحرارية
      this.device = await navigator.bluetooth!.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          '000018f0-0000-1000-8000-00805f9b34fb', // Standard Bluetooth Print
          'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
          '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC UART
          '0000ff00-0000-1000-8000-00805f9b34fb',
          '00001101-0000-1000-8000-00805f9b34fb',
        ],
      });

      const server = await this.device.gatt.connect();

      // البحث عن أول خدمة متاحة للكتابة
      const services = await server.getPrimaryServices();
      for (const service of services) {
        try {
          const characteristics = await service.getCharacteristics();
          for (const char of characteristics) {
            if (char.properties.write || char.properties.writeWithoutResponse) {
              this.characteristic = char;
              return true;
            }
          }
        } catch {
          // استمرار البحث في بقية الخدمات
        }
      }

      throw new Error('لم يتم العثور على قناة كتابة متوافقة في طابعة البلوتوث.');
    } catch (err: any) {
      console.error('خطأ اتصال البلوتوث:', err);
      throw err;
    }
  }

  // إرسال حزم البيانات للطابعة مع تقسيم الحزم (Chunking) لتفادي فيض الذاكرة (Buffer Overflow)
  private async sendData(data: Uint8Array): Promise<void> {
    if (!this.characteristic) {
      const connected = await this.connect();
      if (!connected || !this.characteristic) {
        throw new Error('الطابعة غير متصلة.');
      }
    }

    const maxChunk = 64; // حجم الحزمة الآمن للبلوتوث
    for (let i = 0; i < data.length; i += maxChunk) {
      const chunk = data.slice(i, i + maxChunk);
      if (this.characteristic.writeValueWithoutResponse) {
        await this.characteristic.writeValueWithoutResponse(chunk);
      } else {
        await this.characteristic.writeValue(chunk);
      }
      // مهلة قصيرة بين الحزم
      await new Promise((res) => setTimeout(res, 20));
    }
  }

  // طباعة وصل حراري كامل للمشترك
  async printReceipt(
    subscriber: Subscriber,
    payment: Payment,
    remainingDebt: number,
    settings?: TenantSettings
  ): Promise<void> {
    const generatorName = settings?.generatorName || 'إدارة المولدة الأهلية';
    const ownerPhone = settings?.phone || '';
    const dateFormatted = new Date(payment.paymentDate).toLocaleDateString('ar-IQ', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const commands: number[] = [];

    // 1. تهيئة الطابعة (ESC @)
    commands.push(0x1b, 0x40);

    // 2. محاذاة في الوسط (ESC a 1)
    commands.push(0x1b, 0x61, 0x01);

    // 3. تكبير الخط وتغميقه للعنوان (GS ! 0x11, ESC E 1)
    commands.push(0x1b, 0x45, 0x01);
    this.appendString(commands, `${generatorName}\n`);
    commands.push(0x1b, 0x45, 0x00);

    this.appendString(commands, `هاتف: ${ownerPhone}\n`);
    this.appendString(commands, '================================\n');
    this.appendString(commands, '*** وصل قبض كهرباء أهلية ***\n');
    this.appendString(commands, '--------------------------------\n');

    // 4. محاذاة لليمين / النص العادي (ESC a 0)
    commands.push(0x1b, 0x61, 0x00);
    this.appendString(commands, `رقم الوصل: ${payment.receiptNumber}\n`);
    this.appendString(commands, `التاريخ  : ${dateFormatted}\n`);
    this.appendString(commands, `المشترك  : ${subscriber.fullName}\n`);
    this.appendString(commands, `العنوان  : ${subscriber.street}\n`);
    this.appendString(commands, `رقم القاطع: ${subscriber.breakerNumber}\n`);
    this.appendString(commands, `الامبيرات : ${subscriber.amperes} امبير\n`);
    this.appendString(commands, '--------------------------------\n');

    // 5. المبالغ المالية بخط عريض
    commands.push(0x1b, 0x45, 0x01);
    this.appendString(commands, `المبلغ الواصل : ${formatIQD(payment.amount)}\n`);
    commands.push(0x1b, 0x45, 0x00);

    this.appendString(
      commands,
      `المتبقي بذمته : ${remainingDebt > 0 ? formatIQD(remainingDebt) : '0 د.ع (خالص)'}\n`
    );

    if (payment.notes) {
      this.appendString(commands, `ملاحظات: ${payment.notes}\n`);
    }

    this.appendString(commands, '================================\n');

    // 6. تذييل وتغذية ورق وقص
    commands.push(0x1b, 0x61, 0x01);
    this.appendString(commands, `المحصل: ${payment.collectorName}\n`);
    this.appendString(commands, 'شكرا لالتزامكم بالتسديد\n\n\n');

    // تغذية ورق وقطع (GS V 66 0)
    commands.push(0x1d, 0x56, 0x42, 0x00);

    const buffer = new Uint8Array(commands);
    await this.sendData(buffer);
  }

  // طباعة تجريبية لاختبار الطابعة
  async printTestPage(generatorName: string = 'منظومة المولدات الأهلية'): Promise<void> {
    const commands: number[] = [];
    commands.push(0x1b, 0x40); // Init
    commands.push(0x1b, 0x61, 0x01); // Center
    commands.push(0x1b, 0x45, 0x01); // Bold on
    this.appendString(commands, `*** فحص الطابعة الحرارية ***\n`);
    this.appendString(commands, `${generatorName}\n`);
    commands.push(0x1b, 0x45, 0x00); // Bold off
    this.appendString(commands, '--------------------------------\n');
    this.appendString(commands, 'الاتصال عبر البلوتوث يعمل بنجاح!\n');
    this.appendString(commands, `الوقت: ${new Date().toLocaleTimeString('ar-IQ')}\n`);
    this.appendString(commands, 'جاهز لطباعة وصولات الجباية\n');
    this.appendString(commands, '================================\n\n\n');
    commands.push(0x1d, 0x56, 0x42, 0x00); // Cut

    const buffer = new Uint8Array(commands);
    await this.sendData(buffer);
  }

  // تحويل النصوص إلى ترميز مصفوفة بايتات
  private appendString(commands: number[], text: string) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(text);
    for (let i = 0; i < bytes.length; i++) {
      commands.push(bytes[i]);
    }
  }

  // قطع الاتصال
  disconnect() {
    if (this.device && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
    this.device = null;
    this.characteristic = null;
  }
}

export const bluetoothPrinter = new BluetoothPrinterService();
