import { createClient } from '@supabase/supabase-js';

// رابط ومفتاح الاتصال السحابي (مع استخدام المتغيرات البيئية كأولوية)
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://qqibeaastbbpnnrllnfu.supabase.co';

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_GMhFTfSU4bkp1KQTWAQzFQ_YxA8PVrO';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
