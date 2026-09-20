import { createClient } from '@supabase/supabase-js';

// قراءة مفاتيح الاتصال من متغيرات البيئة المحلية (.env) لضمان الأمان وعدم تسريب المفاتيح
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'تنبيه: مفاتيح Supabase غير محددة في متغيرات البيئة. يعمل التطبيق حالياً بالوضع المحلي الخالص (Offline-Only).'
  );
}

// إنشاء عميل Supabase مع قيم احتياطية لتفادي تعطل التطبيق عند انعدام الاتصال أو عدم إدخال المفاتيح
export const supabase = createClient(
  supabaseUrl || 'https://offline-placeholder.supabase.co',
  supabaseAnonKey || 'offline-placeholder-anon-key'
);
