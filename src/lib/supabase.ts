import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_KEY as string;
const SERVICE_KEY = import.meta.env.VITE_SUPABASE_SERVICE_KEY as string;

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('❌ VITE_SUPABASE_URL ou VITE_SUPABASE_KEY não definidos no .env');
}

console.log('[supabase] URL:', SUPABASE_URL?.slice(0, 30));

const authOptions = { auth: { persistSession: false, autoRefreshToken: false } };

// Auth client — anon key, usado apenas para signInWithPassword / signOut
export const supabaseAuth = createClient(SUPABASE_URL, ANON_KEY, authOptions);

// DB client — service role key, bypassa RLS e permissões para todas as queries de dados
export const supabase = createClient(SUPABASE_URL, SERVICE_KEY || ANON_KEY, authOptions);
