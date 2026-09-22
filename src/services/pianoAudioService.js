// Web Audio API tone generator for the Piano Sequence Memory game. No
// external audio files: every note is a short synthesized tone. One shared
// AudioContext for the whole session — created lazily and reused across
// rounds rather than a fresh context per note (that's what AudioService's
// existing playChime does for its own one-off chimes; a multi-note sequence
// needs one persistent context to schedule notes back-to-back).
let ctx = null;

function getContext() {
  if (typeof window === 'undefined') return null;
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return null;
  if (!ctx) ctx = new AudioContextCtor();
  return ctx;
}

// Browsers suspend a new/backgrounded AudioContext until a user gesture.
// Called defensively before every note, and eagerly on the first key tap —
// so even if the very first auto-played sequence is silently blocked, the
// context is unlocked by the time the player responds, and every sequence
// after that plays normally for the rest of the session.
async function ensureRunning() {
  const context = getContext();
  if (!context) return null;
  if (context.state === 'suspended') {
    try { await context.resume(); } catch { /* still locked; caller just won't hear it */ }
  }
  return context;
}

export const PianoAudioService = {
  isAvailable() { return !!getContext(); },

  unlock() { ensureRunning(); },

  // One short, struck-string tone: a fast attack then an exponential decay,
  // rather than a flat gain (which sounds like a buzzer, not a piano note).
  async playNote(frequency, durationMs = 600) {
    const context = await ensureRunning();
    if (!context) return;
    const now = context.currentTime;
    const durationSec = Math.max(0.05, durationMs / 1000);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.32, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + durationSec + 0.03);
  },

  // Plays each frequency in order with a gap between notes. `onNoteStart(i)`,
  // if given, fires synchronously right as the note at index i begins — the
  // Piano Sequence Memory game's demo phase uses this to press the matching
  // key in sync with its sound, so an elder can learn the sound-to-key
  // mapping by watching, without needing to read note names. Returns
  // { promise, cancel } — an unmounting/advancing component calls cancel()
  // so a stale playback never keeps running (and never fires audio) after
  // the round it belonged to is gone.
  playSequence(frequencies, { noteDurationMs = 600, gapMs = 250, onNoteStart } = {}) {
    let cancelled = false;
    const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
    const run = async () => {
      for (let i = 0; i < frequencies.length; i += 1) {
        if (cancelled) return;
        onNoteStart?.(i);
        await this.playNote(frequencies[i], noteDurationMs);
        if (cancelled) return;
        await wait(noteDurationMs + gapMs);
      }
    };
    return { promise: run(), cancel: () => { cancelled = true; } };
  }
};
