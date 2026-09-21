import { Capacitor, registerPlugin } from '@capacitor/core';
import { normalizePhone } from './phoneNumber';

// Native call / SMS for the caregiver Call + Message feature.
//
// Android (Capacitor): the in-app DirectCall plugin (DirectCallPlugin.java)
// places the call immediately once CALL_PHONE is granted, and falls back to the
// dialer when it isn't — so Call always does *something*. Message opens the
// default SMS app addressed to the number.
// iOS and the web/PWA: a tel:/sms: link. iOS never lets an app auto-dial — the
// system shows its own "Call" confirmation — so this is the most it can do.
//
// Every entry point re-validates the number, so nothing but a well-formed
// E.164 string ever reaches a dialer (no USSD codes like *#06#).

const DirectCall = registerPlugin('DirectCall');

const isAndroid = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

function openLink(scheme, number) {
  window.location.href = `${scheme}:${number}`;
}

export const ContactActionsService = {
  // -> { ok: true, method: 'direct' | 'dialer' } | { ok: false, error: 'invalid_number' | 'unavailable' }
  async call(rawNumber) {
    const number = normalizePhone(rawNumber);
    if (!number) return { ok: false, error: 'invalid_number' };
    try {
      if (isAndroid()) {
        const result = await DirectCall.call({ number });
        return { ok: true, method: result?.method === 'direct' ? 'direct' : 'dialer' };
      }
      openLink('tel', number);
      return { ok: true, method: 'dialer' };
    } catch {
      return { ok: false, error: 'unavailable' };
    }
  },

  // -> { ok: true } | { ok: false, error: 'invalid_number' | 'unavailable' }
  async message(rawNumber) {
    const number = normalizePhone(rawNumber);
    if (!number) return { ok: false, error: 'invalid_number' };
    try {
      if (isAndroid()) await DirectCall.message({ number });
      else openLink('sms', number);
      return { ok: true };
    } catch {
      return { ok: false, error: 'unavailable' };
    }
  }
};
