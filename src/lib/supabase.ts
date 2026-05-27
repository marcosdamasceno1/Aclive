import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nkxyecdxgaxpnezfjkap.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5reHllY2R4Z2F4cG5lemZqa2FwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTY3ODMxMSwiZXhwIjoyMDk1MjU0MzExfQ.TC0J65z6-ZeVsTjvHOXKqGuJzx7bbT0ndfInexQMs38';

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const supabaseAuth = supabase;
