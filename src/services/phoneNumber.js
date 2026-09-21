// Phone-number helpers for the caregiver Call / Message feature.
//
// Numbers are stored (profiles.phone) and handed to the dialer/SMS app in
// E.164 form ("+919876543210"): the one format tel:/sms: links and Android's
// ACTION_CALL all accept, and the one the database CHECK constraint enforces.
// Pure functions only — no I/O — so they are trivial to test.

const E164 = /^\+[1-9]\d{6,14}$/;
const INDIA_MOBILE = /^[6-9]\d{9}$/;

// Turns what a person types into E.164, or returns null when it isn't a
// usable number.
//   "98765 43210", "098765-43210", "+91 98765 43210", "0091 98765 43210"  -> +919876543210
//   "+44 7700 900123"                                                    -> +447700900123
// Without a leading "+" the number is read as an Indian mobile (the app's
// users are in North-East India); any other country needs "+" and its code.
export function normalizePhone(input) {
  if (typeof input !== 'string') return null;
  let value = input.trim();
  if (!value) return null;

  if (value.startsWith('00')) value = `+${value.slice(2)}`;
  if (!/^\+?[\d\s().-]+$/.test(value)) return null; // letters, "*", "#", etc. are never valid

  const digits = value.replace(/\D/g, '');
  let e164;
  if (value.startsWith('+')) {
    e164 = `+${digits}`;
  } else {
    const national = digits.replace(/^0+/, ''); // trunk prefix
    if (national.length === 12 && national.startsWith('91')) e164 = `+${national}`;
    else if (INDIA_MOBILE.test(national)) e164 = `+91${national}`;
    else return null;
  }

  if (!E164.test(e164)) return null;
  if (e164.startsWith('+91') && !INDIA_MOBILE.test(e164.slice(3))) return null;
  return e164;
}

export function isValidPhone(input) {
  return normalizePhone(input) !== null;
}

// "+919876543210" -> "+91 98765 43210". Other countries stay plain E.164: the
// country-code length varies (1-3 digits) and guessing where to split would
// show a misleading number.
export function formatPhoneDisplay(input) {
  const e164 = normalizePhone(input);
  if (!e164) return '';
  if (e164.startsWith('+91')) return `+91 ${e164.slice(3, 8)} ${e164.slice(8)}`;
  return e164;
}
