import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { count: c1 } = await supabase.from('diamond_transactions_log').select('*', { count: 'exact', head: true });
  const { count: c2 } = await supabase.from('diamond_transactions').select('*', { count: 'exact', head: true });
  console.log('Logs count:', c1, c2);
}
check();
