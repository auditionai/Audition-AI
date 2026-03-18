import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

console.log("URL:", supabaseUrl);
console.log("KEY:", supabaseKey ? "exists" : "missing");

if (!supabaseUrl || !supabaseKey) {
  console.log("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: txs, error: err1 } = await supabase.from('transactions').select('*').limit(1);
  console.log("Transactions:", txs, err1);
  
  const { data: dtl, error: err2 } = await supabase.from('diamond_transactions_log').select('*').limit(1);
  console.log("Logs:", dtl, err2);
  
  const { data: gi, error: err3 } = await supabase.from('generated_images').select('*').limit(1);
  console.log("Generated Images:", gi, err3);
}

check();
