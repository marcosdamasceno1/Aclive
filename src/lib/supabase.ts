import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY as string;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ VITE_SUPABASE_URL ou VITE_SUPABASE_KEY não definidos. Crie o arquivo .env na raiz do projeto.');
}

console.log('[supabase] URL:', supabaseUrl?.slice(0, 30));

export const supabase = createClient(supabaseUrl, supabaseKey);
