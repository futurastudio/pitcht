import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

let admin: SupabaseClient | undefined;
let stripe: Stripe | undefined;

export function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server database configuration missing');
  return admin ??= createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('Server billing configuration missing');
  // Keep the existing SDK API version until sandbox payload compatibility is reviewed.
  return stripe ??= new Stripe(key, { maxNetworkRetries: 1 });
}
