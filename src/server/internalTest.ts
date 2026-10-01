import 'server-only';
import { getAdmin } from './clients';

// Owner-approved internal testing. Identity comes only from verified server auth.
// Both this guard and the private database CHECK pin the same single Auth user.
export const INTERNAL_TEST_USER_ID = 'dc869fa0-8652-4df1-bede-93a776ed70eb';

export async function hasInternalTestAccess(userId: string): Promise<boolean> {
  if (userId !== INTERNAL_TEST_USER_ID) return false;
  const { data, error } = await getAdmin().rpc('internal_test_access', { p_user_id: userId });
  if (error || typeof data !== 'boolean') throw new Error('Internal test entitlement unavailable');
  return data;
}
