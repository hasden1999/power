/**
 * src/config/install-texts.ts
 * Installation guidance texts, Arabic copy, and constants for Ampereji
 */

import { APP_CONFIG } from './app-config.ts';

export const INSTALL_CONFIG = {
  SNOOZE_DURATION_DAYS: APP_CONFIG.installSnoozeDays,
  SNOOZE_STORAGE_KEY: APP_CONFIG.storageKeys.installSnoozeUntil,
  DEMO_SESSION_KEY: APP_CONFIG.storageKeys.demoMode,
  PRIMARY_COLOR: APP_CONFIG.themeColor,
};

export const AR_INSTALL_TEXTS = {
  app: {
    name: 'أمبيرجي',
    fullName: 'أمبيرجي (نظام إدارة المولدات الأهلية)',
    tagline: 'منظومة الجباية وإدارة المشتركين وحسابات الديزل',
    badgeOffline: 'يعمل 100% بدون إنترنت',
    badgeZeroCdn: 'تخزين محلي مشفر ومحمي',
  },

  banner: {
    title: 'تثبيت منظومة «أمبيرجي» على جهازك ⚡',
    subtitle: 'ثبّت التطبيق كبرنامج أصلي لضمان الحفظ الدائم للسجلات والعمل أوفلاين',
    benefits: [
      {
        icon: 'database',
        title: 'قاعدة بيانات محلية مشفرة (OPFS)',
        desc: 'حفظ دائم للمشتركين والديون على هاتفك محمي من المسح التلقائي.',
      },
      {
        icon: 'wifiOff',
        title: 'يعمل في وضع الطيران وبدون شبكة',
        desc: 'سجل المقبوضات واطبع الوصولات الميدانية في أي وقت وأي مكان.',
      },
      {
        icon: 'printer',
        title: 'طباعة حرارية فورية للوصولات',
        desc: 'إصدار سندات القبض بدقة 58mm و 80mm متوافقة مع طابعات البلوتوث.',
      },
    ],
    buttons: {
      installNow: 'تثبيت التطبيق الآن ⚡',
      snooze: 'لاحقاً (تأجيل 3 أيام)',
      proceedDemo: 'متابعة للتجربة فقط (بدون حفظ دائم)',
    },
    installedSuccess: 'تم تثبيت تطبيق أمبيرجي بنجاح وتهيئة بيئة العمل المستقلة!',
  },

  iosGuide: {
    modalTitle: 'تثبيت المنظومة على آيفون وآيباد 🍏',
    modalSubtitle: 'اتبع هذه الخطوات البسيطة لتثبيت «أمبيرجي» على شاشتك الرئيسية:',
    steps: [
      {
        stepNumber: 1,
        title: 'اضغط على زر المشاركة (Share)',
        desc: 'في شريط أدوات متصفح Safari السفلي، اضغط على أيقونة المشاركة (مربع بسهم متجه للأعلى ⎋).',
      },
      {
        stepNumber: 2,
        title: 'اختر "إضافة إلى الصفحة الرئيسية"',
        desc: 'مرر القائمة لأسفل حتى تجد خيار "إضافة إلى الصفحة الرئيسية" (Add to Home Screen) مصحوباً بأيقونة ➕.',
      },
      {
        stepNumber: 3,
        title: 'تأكيد التثبيت (Add)',
        desc: 'اضغط على كلمة "إضافة" (Add) في الزاوية العلوية ليظهر تطبيق «أمبيرجي» على شاشة هاتفك كتطبيق مستقل.',
      },
    ],
    hint: 'ملاحظة: تثبيت التطبيق يمنحه مساحة تخزين دائمة مستقلة تحمي ديونك وسجلاتك من الحذف الدوري.',
    closeButton: 'فهمت ذلك',
  },

  inAppBrowser: {
    warningTitle: 'تنبيه: متصفح داخلي غير معتمد ⚠️',
    warningBody:
      'أنت تتصفح المنظومة حالياً من داخل متصفح تطبيق تواصل (مثل تيليغرام، فيسبوك، أو واتساب). هذه البيئات تحذف السجلات تلقائياً بمجرد إغلاق المحادثة ولا تتيح ميزة التثبيت الآمن.',
    instruction:
      'يرجى فتح الرابط في المتصفح الخارجي الرسمي (Safari على أجهزة آبل، أو Chrome على أجهزة أندرويد والكمبيوتر):',
    steps: [
      'اضغط على النقاط الثلاث (⋮ أو ...) في الزاوية العلوية للشاشة.',
      'اختر "فتح في المتصفح" (Open in Safari / Open in Chrome).',
    ],
    actionButton: 'نسخ رابط المنظومة',
    copySuccess: 'تم نسخ الرابط! الصقه في متصفحك الرسمي الآن.',
  },

  ephemeralWarning: {
    badge: 'وضع تجريبي مؤقت (RAM)',
    title: 'تنبيه عاجل: السجلات غير محفوظة بشكل دائم!',
    message:
      'أنت تستخدم المنظومة في وضع المتصفح العادي. تعمل قاعدة البيانات حالياً في الذاكرة المؤقتة (:memory:)، وستفقد جميع المشتركين والوصولات والمبالغ المالية بمجرد تحديث الصفحة أو إغلاق المتصفح! لحفظ السجلات بأمان دائم، يجب تثبيت التطبيق.',
    installCta: 'تثبيت التطبيق وتأمين البيانات ⚡',
  },

  storageGatekeeper: {
    modalTitle: 'لماذا نمنع التخزين في المتصفح العادي؟ 🛡️',
    explanation: [
      'يقوم متصفح Safari على أجهزة iPhone بمسح كافة ملفات التخزين والمواقع (IndexedDB / Cache) تلقائياً إذا مر 7 أيام دون استخدام أو عند امتلاء ذاكرة الهاتف (Apple ITP Policy).',
      'بيانات المولدات الأهلية وسجلات الديون وجداول الوقود أصول مالية حساسة لا تحتمل الضياع.',
      'تثبيت التطبيق على الشاشة الرئيسية (PWA Standalone) يمنحه ترخيص التخزين الدائم الآمن (OPFS) الذي يصمد حتى مع إعادة تشغيل الجهاز أو تفريغ الكاش.',
    ],
    confirmContinueDemo: 'أنا أدرك المخاطر وأريد فقط تجربة الواجهة مؤقتاً',
    installPwaNow: 'تثبيت التطبيق الآن (موصى به بشدة)',
  },
} as const;

export const INSTALL_TEXTS = AR_INSTALL_TEXTS;
