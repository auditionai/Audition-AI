import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.CAULENHAU_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.CAULENHAU_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase URL or Key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('Inspecting transactions table...');
  const { data: txs, error: e1 } = await supabase.from('transactions').select('*').limit(1);
  if (e1) {
    console.error('Error fetching transactions:', e1);
  } else {
    if (txs && txs.length > 0) {
      console.log('Transaction columns:', Object.keys(txs[0]));
    } else {
      console.log('No transactions found. Cannot infer columns from data.');
      // Try to insert a dummy row to see error
      const { error: insertError } = await supabase.from('transactions').insert({
          user_id: 'dummy',
          package_id: 'dummy',
          amount: 1000,
          coins_received: 10,
          status: 'pending',
          code: 'TEST',
          payment_method: 'manual'
      });
      console.log('Insert error (expected):', insertError);
    }
  }
}

run();
