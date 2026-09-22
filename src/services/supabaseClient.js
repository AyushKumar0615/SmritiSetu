import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Add them to .env.local.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // PKCE (rather than the previous default, "implicit") is what makes the
    // Android Google Sign-In deep-link return safe: exchangeCodeForSession()
    // in authService.js verifies the returned code against a verifier held
    // only in this device's storage, so another app registered for the same
    // custom URL scheme can't redeem an intercepted code by itself. The web
    // flow is unaffected — detectSessionInUrl (still on by default) already
    // understands a PKCE "?code=" redirect exactly as it understood the old
    // "#access_token=" one, so a browser sign-in completes the same way.
    flowType: 'pkce'
  }
});

// Most application requests can use the shared client above, which restores
// its browser session automatically. For data that is strictly RLS-protected,
// however, callers can ask for a short-lived client bound to a verified token.
// This prevents a restored UI session from ever issuing a protected query as
// the anonymous role while its auth header is being refreshed.
export async function getVerifiedSupabaseClient() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (sessionError || !accessToken) {
    return { ok: false, error: 'Please sign in again to continue.' };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData?.user) {
    return { ok: false, error: 'Please sign in again to continue.' };
  }

  return {
    ok: true,
    user: userData.user,
    client: createClient(supabaseUrl, supabaseAnonKey, {
      // `accessToken` is supplied directly to supabase-js's request layer;
      // it is never stored, logged, or exposed to application UI code.
      accessToken: async () => accessToken,
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    })
  };
}
