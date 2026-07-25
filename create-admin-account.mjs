import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createAdminTestAccount() {
  console.log('🔧 Creating Admin Test Account...\n');

  const testEmail = 'admin.test@auditionai.vn';
  const testPassword = 'Admin@Test2026!';
  const displayName = 'Admin Test';

  try {
    // 1. Check if user already exists
    console.log('1️⃣ Checking if admin test account exists...');
    const { data: existingUser } = await supabase.auth.admin.listUsers();
    const userExists = existingUser?.users?.find(u => u.email === testEmail);

    let userId;

    if (userExists) {
      console.log('   ✅ User already exists:', testEmail);
      userId = userExists.id;
    } else {
      // 2. Create auth user
      console.log('2️⃣ Creating auth user...');
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: testEmail,
        password: testPassword,
        email_confirm: true,
        user_metadata: {
          display_name: displayName,
          full_name: displayName,
        }
      });

      if (authError) {
        console.error('   ❌ Error creating auth user:', authError.message);
        throw authError;
      }

      userId = authData.user.id;
      console.log('   ✅ Auth user created:', userId);
    }

    // 3. Check if profile exists
    console.log('3️⃣ Checking user profile...');
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileError && profileError.code !== 'PGRST116') {
      console.error('   ❌ Error checking profile:', profileError.message);
    }

    // 4. Create or update profile with admin role
    console.log('4️⃣ Setting up admin profile...');
    const { data: updatedProfile, error: updateError } = await supabase
      .from('users')
      .upsert({
        id: userId,
        email: testEmail,
        display_name: displayName,
        vcoin_balance: 999999,
        photo_url: 'https://picsum.photos/200/200?grayscale',
        is_admin: true,
        created_at: new Date().toISOString(),
        last_active: new Date().toISOString(),
      }, {
        onConflict: 'id',
        ignoreDuplicates: false
      })
      .select()
      .single();

    if (updateError) {
      console.error('   ❌ Error creating/updating profile:', updateError.message);
      throw updateError;
    }

    console.log('   ✅ Admin profile created/updated');

    // 5. Summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ ADMIN TEST ACCOUNT CREATED SUCCESSFULLY!');
    console.log('='.repeat(60));
    console.log('📧 Email    :', testEmail);
    console.log('🔑 Password :', testPassword);
    console.log('👤 Name     :', displayName);
    console.log('🆔 User ID  :', userId);
    console.log('💎 VCoin    : 999,999 (unlimited for testing)');
    console.log('🛡️  Role     : admin');
    console.log('='.repeat(60));
    console.log('\n🎯 Login at: http://localhost:5173/');
    console.log('📝 Use email/password login or Google OAuth\n');

  } catch (error) {
    console.error('\n❌ Failed to create admin account:', error);
    process.exit(1);
  }
}

createAdminTestAccount();
