import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';

// Android hardware Back handling. The app has no router (navigation is React
// state), so screens register a handler here while they hold something the
// user should be able to back out of (an open modal, a sub-page, a game
// step). On Android, Back runs the most specific registered handler; when
// none handles it the app is at its root and exits. On the web nothing is
// listened to, so normal browser Back behaviour is untouched.

// Higher runs first, so a modal closes before its page, and a page before its mode.
export const BACK_PRIORITY = { OVERLAY: 300, SCREEN_STEP: 200, SUBVIEW: 100, MODE: 50 };

const handlers = new Set();
let sequence = 0;
let listenerAttached = false;

function dispatch() {
  const ordered = [...handlers].sort((a, b) => b.priority - a.priority || b.order - a.order);
  for (const entry of ordered) {
    try {
      if (entry.handler() === true) return true;
    } catch {
      // A broken handler must never trap the user — fall through to the next one.
    }
  }
  return false;
}

export const BackButtonService = {
  register(handler, priority = BACK_PRIORITY.SUBVIEW) {
    const entry = { handler, priority, order: ++sequence };
    handlers.add(entry);
    return () => handlers.delete(entry);
  },

  init() {
    if (listenerAttached || !Capacitor.isNativePlatform()) return;
    listenerAttached = true;
    CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (dispatch()) return;
      if (canGoBack) {
        window.history.back();
        return;
      }
      CapacitorApp.exitApp();
    });
  }
};
