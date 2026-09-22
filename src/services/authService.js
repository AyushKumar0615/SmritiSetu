import { Capacitor } from '@capacitor/core';
import { supabase } from './supabaseClient';
import { normalizeRole, isPublicRegistrationRole } from '../access/permissions';

// Deep-link redirect for Google Sign-In on Android. Must match, exactly:
//   - the intent-filter data tag in android/app/src/main/AndroidManifest.xml
//   - an entry in Supabase Dashboard -> Authentication -> URL Configuration
//     -> Redirect URLs (server-side allow list; signInWithOAuth's redirectTo
//     is rejected if it isn't listed there)
// Unused on web — signInWithOAuth() there omits `options` entirely, so
// Supabase falls back to the dashboard's Site URL exactly as before.
export const GOOGLE_OAUTH_NATIVE_REDIRECT = 'com.smritisetu.app://login-callback';

function toSession(user, profile) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    fullName: profile?.full_name || '',
    // normalizeRole falls back to the least-privileged role for anything
    // missing/unrecognized (e.g. a failed profile fetch) instead of
    // silently granting a more privileged default.
    role: normalizeRole(profile?.role),
    state: profile?.state || '',
    language: profile?.language || 'as',
    avatar: profile?.avatar || null
  };
}

async function fetchProfile(userId) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (error) return null;
  return data;
}

export const AuthService = {
  async getSession() {
    const { data } = await supabase.auth.getSession();
    const user = data?.session?.user;
    if (!user) return null;
    const profile = await fetchProfile(user.id);
    return toSession(user, profile);
  },

  async login({ email, password }) {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      return { ok: false, error: 'Invalid email or password.' };
    }
    const profile = await fetchProfile(data.user.id);
    return { ok: true, session: toSession(data.user, profile) };
  },

  // Google OAuth via Supabase Auth.
  //
  // Web: `redirectTo` is left unset, exactly as before — Supabase falls back
  // to the Site URL configured in the dashboard. supabase-js redirects the
  // browser to Google immediately; nothing after that runs in this tab. The
  // user who lands back in the app is picked up by the existing
  // getSession() restoration in App.jsx exactly like any other session.
  //
  // Android: `redirectTo` is the app's own deep link (see
  // GOOGLE_OAUTH_NATIVE_REDIRECT above). supabase-js still tries to open it
  // via `window.location.href`, but Capacitor's WebView intercepts any URL
  // whose host isn't the app's own origin and hands it to the system browser
  // as an external intent instead of navigating the WebView there — Google
  // rejects sign-in inside an embedded WebView, so this matters, and it
  // needs no extra plugin (no @capacitor/browser) to get that behaviour.
  // completeOAuthRedirect() below (wired up in AuthPortal's appUrlOpen
  // listener) picks up the session once Google/Supabase redirect back to
  // that deep link.
  async loginWithGoogle() {
    const options = Capacitor.isNativePlatform() ? { redirectTo: GOOGLE_OAUTH_NATIVE_REDIRECT } : undefined;
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', ...(options && { options }) });
    if (error) return { ok: false, error: 'Could not start Google sign-in. Please try again.' };
    return { ok: true };
  },

  // Completes the Android deep-link return from loginWithGoogle(). `url` is
  // the full `com.smritisetu.app://login-callback?...` string Capacitor's
  // App plugin hands to the appUrlOpen listener. Reuses the exact same
  // fetchProfile()/toSession() pipeline every other sign-in path uses, so a
  // Google user on Android enters the app through the identical session
  // shape as email/password or web Google Sign-In.
  async completeOAuthRedirect(url) {
    let parsed;
    try { parsed = new URL(url); } catch { return { ok: false, error: 'Google sign-in did not complete. Please try again.' }; }

    const providerError = parsed.searchParams.get('error_description') || parsed.searchParams.get('error');
    if (providerError) return { ok: false, error: providerError };

    const code = parsed.searchParams.get('code');
    if (!code) return { ok: false, error: 'Google sign-in did not complete. Please try again.' };

    // The stored PKCE code verifier is what actually proves this exchange
    // belongs to the sign-in this device started — exchangeCodeForSession()
    // enforces that itself (AuthPKCECodeVerifierMissingError otherwise);
    // nothing here bypasses or replaces that check.
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data?.user) return { ok: false, error: 'Google sign-in did not complete. Please try again.' };

    const profile = await fetchProfile(data.user.id);
    return { ok: true, session: toSession(data.user, profile) };
  },

  async register(payload) {
    // Client-side fail-fast for a tampered/modified registration request —
    // a friendly error instead of a raw database error. This is NOT the
    // real security boundary: the "insert own profile" RLS policy rejects
    // role='admin' at the database layer regardless of what's sent here.
    if (!isPublicRegistrationRole(payload.role)) {
      return { ok: false, error: 'Please choose a valid account type.' };
    }

    const { data, error } = await supabase.auth.signUp({
      email: payload.email.trim(),
      password: payload.password
    });

    if (error) {
      return { ok: false, error: error.message.includes('already registered') ? 'An account with this email already exists.' : error.message };
    }

    const user = data.user;
    if (!user) {
      return { ok: false, error: 'Registration failed. Please try again.' };
    }

    const profileRow = {
      id: user.id,
      full_name: payload.fullName.trim(),
      role: payload.role,
      state: payload.state,
      language: payload.language,
      avatar: payload.avatar || null
    };
    const { error: profileError } = await supabase.from('profiles').insert(profileRow);
    if (profileError) {
      return { ok: false, error: profileError.message };
    }

    if (!data.session) {
      return { ok: false, error: 'Account created. Please check your email to confirm, then sign in.' };
    }

    return { ok: true, session: toSession(user, profileRow) };
  },

  async updateAvatar(userId, avatar) {
    const { error } = await supabase.from('profiles').update({ avatar }).eq('id', userId);
    if (error) return this.getSession();

    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user || user.id !== userId) return this.getSession();
    const profile = await fetchProfile(userId);
    return toSession(user, profile);
  },

  async logout() {
    await supabase.auth.signOut();
  }
};
