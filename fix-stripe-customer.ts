/**
 * Fix Stripe Customer ID Mismatch
 * Run this to clean up invalid subscription data
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function fixStripeCustomer() {
  const userEmail = 'joseartigas281@gmail.com';

  console.log(`🔍 Finding user: ${userEmail}`);

  // Get user ID
  const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();

  if (usersError) {
    console.error('❌ Error fetching users:', usersError);
    return;
  }

  const user = users.find(u => u.email === userEmail);

  if (!user) {
    console.error('❌ User not found');
    return;
  }

  console.log(`✅ Found user: ${user.id}`);

  // Check subscriptions
  const { data: subs, error: subsError } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', user.id);

  if (subsError) {
    console.error('❌ Error fetching subscriptions:', subsError);
    return;
  }

  console.log(`📊 Found ${subs?.length || 0} subscription(s):`);
  subs?.forEach(sub => {
    console.log(`  - Customer ID: ${sub.stripe_customer_id}, Status: ${sub.status}`);
  });

  if (subs && subs.length > 0) {
    console.log('');
    console.log('🗑️  To fix this, delete the invalid subscription records:');
    console.log('');
    console.log('Run this SQL in Supabase SQL Editor:');
    console.log('');
    console.log(`DELETE FROM subscriptions WHERE user_id = '${user.id}';`);
    console.log('');
    console.log('After deleting, the user can subscribe fresh from the Pricing page.');
  } else {
    console.log('✅ No subscriptions found - user is clean!');
  }
}

fixStripeCustomer().catch(console.error);
