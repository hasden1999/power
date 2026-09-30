/**
 * Iraqi Generator Operations Test Fixtures & Constants
 * Based on ORIGINAL_REQUEST.md and PROJECT.md requirements
 */

export interface TestSubscriberData {
  fullName: string;
  phone: string;
  street: string;
  breakerNumber: string;
  amperes: number;
  subscriptionType: 'normal' | 'gold' | 'night' | 'morning';
  openingBalance: number;
  notes?: string;
}

export const IRAQI_NAMES = [
  'كرار حيدر الشمري',
  'مصطفى علي السعدي',
  'أحمد ستار الجبوري',
  'حيدر جاسم الربيعي',
  'سجاد عادل الدليمي',
  'عمر فاروق التميمي',
  'مرتضى كاظم الزيدي',
  'زينب حسين الموسوي',
  'فاطمة عباس العبيدي',
  'نور الهدى كريم المالكي'
];

export const IRAQI_NEIGHBORHOODS = [
  'بغداد - حي الجامعة - محلة 629 - زقاق 14 - دار 5',
  'بغداد - الكرادة داخل - محلة 903 - زقاق 22 - دار 11',
  'بغداد - المنصور / 14 رمضان - محلة 609 - زقاق 5 - دار 18',
  'بغداد - حي العامل / الأولى - محلة 811 - زقاق 3 - دار 42',
  'بغداد - الدورة / الميكانيك - محلة 828 - زقاق 9 - دار 15',
  'بغداد - الشعب / الجمعيات - محلة 324 - زقاق 17 - دار 8',
  'بغداد - الزعفرانية / الرشيد - محلة 958 - زقاق 11 - دار 23',
  'بغداد - الغزالية / شارع الميثاق - محلة 673 - زقاق 30 - دار 19'
];

export const IRAQI_PHONES = [
  '07701234567',
  '07802345678',
  '07503456789',
  '07719876543',
  '07828765432',
  '07517654321',
  '07736543210',
  '07845432109'
];

export const DEFAULT_GENERATOR_CONFIG = {
  name: 'مولدة حي الجامعة الأهلية 1',
  owner: 'أبو كرار الساعدي',
  phone: '07709876543',
  capacityKva: 500,
  safeLoadPercentage: 0.80, // 80% safe continuous load
  defaultPriceNormal: 12000, // 12,000 IQD per normal ampere
  defaultPriceGold: 18000,   // 18,000 IQD per 24h gold ampere
  defaultPriceNight: 8000    // 8,000 IQD per night ampere
};

export const SAMPLE_SUBSCRIBERS: TestSubscriberData[] = [
  {
    fullName: 'كرار حيدر الشمري',
    phone: '07701234567',
    street: 'حي الجامعة - م 629 ز 14 د 5',
    breakerNumber: 'R-01',
    amperes: 5,
    subscriptionType: 'normal',
    openingBalance: 0,
    notes: 'خط منزلي رئيسي'
  },
  {
    fullName: 'مصطفى علي السعدي',
    phone: '07802345678',
    street: 'حي الجامعة - م 629 ز 14 د 7',
    breakerNumber: 'R-02',
    amperes: 10,
    subscriptionType: 'gold',
    openingBalance: 12000,
    notes: 'صيدلية اليرموك - خط 24 ساعة'
  },
  {
    fullName: 'أحمد ستار الجبوري',
    phone: '07503456789',
    street: 'حي الجامعة - م 629 ز 16 د 12',
    breakerNumber: 'S-01',
    amperes: 3.5,
    subscriptionType: 'normal',
    openingBalance: 0
  },
  {
    fullName: 'حيدر جاسم الربيعي',
    phone: '07719876543',
    street: 'حي الجامعة - م 629 ز 18 د 22',
    breakerNumber: 'S-02',
    amperes: 6,
    subscriptionType: 'night',
    openingBalance: 25000,
    notes: 'محل حلاقة'
  },
  {
    fullName: 'زينب حسين الموسوي',
    phone: '07828765432',
    street: 'حي الجامعة - م 629 ز 20 د 3',
    breakerNumber: 'T-01',
    amperes: 8,
    subscriptionType: 'gold',
    openingBalance: 0
  }
];

export const SAMPLE_EXPENSES = [
  {
    category: 'fuel' as const,
    title: 'تزويد صهريج كاز (ديزل)',
    liters: 1500,
    amount: 1125000, // 1500L * 750 IQD
    date: '2026-07-05',
    notes: 'وصل شركة توزيع المنتجات النفطية - سعر اللتر 750 د.ع'
  },
  {
    category: 'oil_maintenance' as const,
    title: 'تبديل دهن 20W50 مع فلاتر الديزل',
    amount: 160000,
    date: '2026-07-10',
    notes: '4 صفائح دهن مع 2 فلاتر كاز وفلتر هواء'
  },
  {
    category: 'repairs' as const,
    title: 'تصليح كارتة المولد ولحام قاعدة الرادياتير',
    amount: 250000,
    date: '2026-07-15',
    notes: 'ورشة السلام الميكانيكية'
  },
  {
    category: 'salaries' as const,
    title: 'سلفة أجور المشغل والجابي',
    amount: 300000,
    date: '2026-07-20',
    notes: 'أجور الأسبوع الثاني'
  },
  {
    category: 'rent' as const,
    title: 'بدل إيجار أرضية المولدة للمنطقة',
    amount: 200000,
    date: '2026-07-25',
    notes: 'إيجار شهري'
  }
];
