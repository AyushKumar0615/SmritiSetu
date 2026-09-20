import { Capacitor } from '@capacitor/core';
import { supabase } from './supabaseClient';

// Android FCM registration (Phase 3A): once a user is signed in, ask for the
// notification permission if needed, register with Firebase, and save the
// device token for that user. Nothing here sends or displays a notification.
// Started once from main.jsx; a no-op in the browser/PWA, so the web Push
// stack (PushSubscriptionService + service worker) is untouched. The token
// is never logged — only a short non-reversible tag and its length.

export const REMINDER_CHANNEL_ID = 'smritisetu-reminders';

const TAG = '[push]';

let started = false;
let PushNotifications = null;
let currentUserId = null;
let currentToken = null;
let savedKey = null; // `${userId}:${tokenTag}` of the last token save that succeeded
let savingKey = null; // same key while a save is in flight, so duplicate events don't double-send
let askedThisSession = false;

// Correlates a token in logs without revealing it (FNV-1a, 32-bit).
function tokenTag(token) {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i += 1) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function scrub(text) {
  const value = String(text ?? '');
  return currentToken ? value.split(currentToken).join('<token>') : value;
}

async function createReminderChannel() {
  try {
    // Creating a channel that already exists is a no-op on Android.
    await PushNotifications.createChannel({
      id: REMINDER_CHANNEL_ID,
      name: 'Reminders',
      description: 'Medication and daily routine reminders',
      importance: 4,
      vibration: true,
      lights: true
    });
  } catch (err) {
    console.warn(TAG, 'could not create the reminders channel:', scrub(err?.message || err));
  }
}

async function saveToken() {
  if (!currentUserId || !currentToken) return;
  const tag = tokenTag(currentToken);
  const key = `${currentUserId}:${tag}`;
  if (savedKey === key || savingKey === key) return;

  savingKey = key;
  try {
    const { error } = await supabase.rpc('register_fcm_token', { p_token: currentToken });
    if (error) {
      // Left unsaved on purpose: the next sign-in event / app launch retries.
      console.warn(TAG, `could not save device token (token#${tag}, ${currentToken.length} chars):`, scrub(error.code || error.message));
      return;
    }
    savedKey = key;
    console.info(TAG, `device token saved (token#${tag}, ${currentToken.length} chars)`);
  } finally {
    savingKey = null;
  }
}

async function ensureRegistered(userId) {
  currentUserId = userId;
  if (savedKey && savedKey.startsWith(`${userId}:`)) return;

  try {
    let { receive } = await PushNotifications.checkPermissions();
    if (receive === 'prompt' || receive === 'prompt-with-rationale') {
      // Ask at most once per app session — never nag on every sign-in event.
      if (askedThisSession) return;
      askedThisSession = true;
      ({ receive } = await PushNotifications.requestPermissions());
    }
    if (receive !== 'granted') {
      console.info(TAG, 'notification permission not granted; not registering for push');
      return;
    }
    // Emits 'registration' with the current token (or 'registrationError').
    await PushNotifications.register();
  } catch (err) {
    console.warn(TAG, 'push registration failed:', scrub(err?.message || err));
  }
}

export const NativePushService = {
  async init() {
    if (started || !(Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android')) return;
    started = true;

    try {
      // Loaded only inside the Android app — never fetched by the web bundle.
      ({ PushNotifications } = await import('@capacitor/push-notifications'));

      // 'registration' also fires when Firebase rotates the token later on.
      await PushNotifications.addListener('registration', (token) => {
        currentToken = token?.value || null;
        void saveToken();
      });
      await PushNotifications.addListener('registrationError', (err) => {
        console.warn(TAG, 'FCM registration failed:', scrub(err?.error));
      });

      await createReminderChannel();

      supabase.auth.onAuthStateChange((event, session) => {
        const user = session?.user;
        if (!user) {
          currentUserId = null;
          savedKey = null;
          return;
        }
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
          // Deferred: supabase-js must not be re-entered from inside this callback.
          setTimeout(() => { void ensureRegistered(user.id); }, 0);
        }
      });
    } catch (err) {
      console.warn(TAG, 'push setup failed:', scrub(err?.message || err));
    }
  }
};
