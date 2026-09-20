import { useEffect, useRef } from 'react';
import { BackButtonService, BACK_PRIORITY } from '../services/backButtonService';

// While `enabled`, hardware Back (Android) calls `handler`. Return true from
// the handler once it has handled the press; anything else falls through to
// the next handler (and ultimately to exiting the app).
export function useBackButton(handler, { enabled = true, priority = BACK_PRIORITY.SUBVIEW } = {}) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return undefined;
    return BackButtonService.register(() => handlerRef.current(), priority);
  }, [enabled, priority]);
}
