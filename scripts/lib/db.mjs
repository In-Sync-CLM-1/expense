// Service-role Supabase client for seed scripts + in-scene live updates.
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './env.mjs';

const env = loadEnv(new URL('../../.env', import.meta.url));

export const SUPABASE_URL = env.SUPABASE_URL;
export const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
export const anon = createClient(env.SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
export { env };

// Insert in chunks (PostgREST payload limits + sane error surface).
export async function bulkInsert(table, rows, chunk = 500) {
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await db.from(table).insert(rows.slice(i, i + chunk));
    if (error) throw new Error(`${table} insert (rows ${i}..${i + chunk}): ${error.message}`);
  }
}
