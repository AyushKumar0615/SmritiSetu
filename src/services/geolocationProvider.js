import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

// Thin wrapper around location access — deliberately the ONLY file in this
// app that touches `navigator.geolocation` (web) or Capacitor's Geolocation
// plugin (Android). Callers (the tracking hook, the elder/caregiver/admin UI)
// only depend on this shape: isSupported / checkPermission /
// getCurrentPosition / watchPosition / clearWatch, and on errors carrying the
// same numeric `code` as a browser GeolocationPositionError (see GEO_ERROR).
//
// In the browser this uses the standard Geolocation API. In the Android app
// it uses the native plugin, which shows the real OS permission dialog.
// Either way this covers foreground tracking only: it cannot and does not
// claim to track location while the app is closed or suspended — that needs
// a native background-location implementation, which is not part of this.

const isNative = () => Capacitor.isNativePlatform();

// GeolocationPositionError codes, named for readability at call sites.
export const GEO_ERROR = { PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };

// Plugin errors carry a string code (e.g. 'OS-PLUG-GLOC-0003' = permission
// denied, '-0010' = timeout) instead of the browser's numeric one.
function toGeoError(err) {
  const pluginCode = String(err?.code ?? '');
  const message = String(err?.message ?? '');
  let code = GEO_ERROR.POSITION_UNAVAILABLE;
  if (pluginCode.endsWith('0003') || (/permission/i.test(message) && /denied/i.test(message))) {
    code = GEO_ERROR.PERMISSION_DENIED;
  } else if (pluginCode.endsWith('0010') || /timeout|in time/i.test(message)) {
    code = GEO_ERROR.TIMEOUT;
  }
  return { code, message };
}

// Coarse ("approximate") location is enough to work with, so either grant counts.
function toPermissionState(status) {
  if (status?.location === 'granted' || status?.coarseLocation === 'granted') return 'granted';
  if (status?.location === 'denied') return 'denied';
  return 'prompt';
}

export const GeolocationProvider = {
  isSupported() {
    if (isNative()) return true;
    return typeof navigator !== 'undefined' && !!navigator.geolocation;
  },

  // Returns 'granted' | 'denied' | 'prompt' | 'unavailable'.
  // The Permissions API isn't universally supported (older Safari lacks a
  // 'geolocation' descriptor) — callers should treat 'prompt' from here as
  // "unknown ahead of time, try requesting" rather than a hard signal.
  async checkPermission() {
    if (isNative()) {
      try {
        return toPermissionState(await Geolocation.checkPermissions());
      } catch {
        return 'prompt';
      }
    }
    if (!this.isSupported()) return 'unavailable';
    if (!navigator.permissions?.query) return 'prompt';
    try {
      const status = await navigator.permissions.query({ name: 'geolocation' });
      return status.state;
    } catch {
      return 'prompt';
    }
  },

  // On Android this is what shows the OS location permission dialog, so it
  // must be reached from a user action (enabling sharing), never on load.
  async getCurrentPosition(options = {}) {
    if (isNative()) {
      let state = await this.checkPermission();
      if (state !== 'granted') {
        try {
          state = toPermissionState(await Geolocation.requestPermissions({ permissions: ['location'] }));
        } catch (err) {
          throw toGeoError(err);
        }
      }
      if (state !== 'granted') {
        throw { code: GEO_ERROR.PERMISSION_DENIED, message: 'Location permission denied' };
      }
      try {
        return await Geolocation.getCurrentPosition({
          enableHighAccuracy: false,
          timeout: 15000,
          maximumAge: 60000,
          ...options
        });
      } catch (err) {
        throw toGeoError(err);
      }
    }
    if (!this.isSupported()) return Promise.reject({ code: 0, message: 'unavailable' });
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 60000,
        ...options
      });
    });
  },

  // Returns a watch handle usable with clearWatch, or null if geolocation
  // isn't supported in this environment. On Android the plugin registers the
  // watch asynchronously, so the handle is an object clearWatch understands.
  watchPosition(onPosition, onError, options = {}) {
    if (isNative()) {
      const handle = { native: true, cancelled: false, idPromise: null };
      handle.idPromise = Geolocation.watchPosition(
        { enableHighAccuracy: false, timeout: 20000, maximumAge: 30000, ...options },
        (position, err) => {
          if (handle.cancelled) return;
          if (err) onError(toGeoError(err));
          else if (position) onPosition(position);
        }
      ).catch((err) => {
        if (!handle.cancelled) onError(toGeoError(err));
        return null;
      });
      return handle;
    }
    if (!this.isSupported()) return null;
    return navigator.geolocation.watchPosition(onPosition, onError, {
      enableHighAccuracy: false,
      timeout: 20000,
      maximumAge: 30000,
      ...options
    });
  },

  clearWatch(watchHandle) {
    if (watchHandle?.native) {
      watchHandle.cancelled = true;
      watchHandle.idPromise.then((id) => {
        if (id != null) Geolocation.clearWatch({ id }).catch(() => {});
      });
      return;
    }
    if (watchHandle != null && this.isSupported()) {
      navigator.geolocation.clearWatch(watchHandle);
    }
  }
};
