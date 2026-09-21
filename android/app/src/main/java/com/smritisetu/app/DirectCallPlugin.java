package com.smritisetu.app;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.regex.Pattern;

/**
 * Caregiver Call + Message.
 *
 * call(): places the call straight away with ACTION_CALL once CALL_PHONE is
 * granted (asking for it the first time). If the permission is refused, or the
 * device won't place the call directly, it opens the dialer with the number
 * filled in (ACTION_DIAL) so the user can still call with one tap.
 * message(): opens the default SMS app addressed to the number.
 *
 * The number must be strict E.164 ("+919876543210"): this is the only thing that
 * ever reaches a dialer, so USSD/MMI codes such as "*#06#" can't get through.
 */
@CapacitorPlugin(
    name = "DirectCall",
    permissions = { @Permission(strings = { Manifest.permission.CALL_PHONE }, alias = "call") }
)
public class DirectCallPlugin extends Plugin {

    private static final Pattern E164 = Pattern.compile("^\\+[1-9][0-9]{6,14}$");

    @PluginMethod
    public void call(PluginCall call) {
        String number = validNumber(call);
        if (number == null) return;

        if (getPermissionState("call") == PermissionState.GRANTED) {
            placeCall(call, number);
        } else {
            requestPermissionForAlias("call", call, "callPermissionResult");
        }
    }

    @PermissionCallback
    private void callPermissionResult(PluginCall call) {
        String number = validNumber(call);
        if (number == null) return;

        if (getPermissionState("call") == PermissionState.GRANTED) {
            placeCall(call, number);
        } else {
            openDialer(call, number);
        }
    }

    @PluginMethod
    public void message(PluginCall call) {
        String number = validNumber(call);
        if (number == null) return;

        try {
            Intent intent = new Intent(Intent.ACTION_SENDTO, Uri.fromParts("smsto", number, null));
            getActivity().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("no_sms_app");
        }
    }

    private void placeCall(PluginCall call, String number) {
        try {
            Intent intent = new Intent(Intent.ACTION_CALL, Uri.fromParts("tel", number, null));
            getActivity().startActivity(intent);
            resolveWith(call, "direct");
        } catch (SecurityException | ActivityNotFoundException e) {
            // Permission revoked mid-flight, or no telephony: hand over to the dialer.
            openDialer(call, number);
        }
    }

    private void openDialer(PluginCall call, String number) {
        try {
            Intent intent = new Intent(Intent.ACTION_DIAL, Uri.fromParts("tel", number, null));
            getActivity().startActivity(intent);
            resolveWith(call, "dialer");
        } catch (ActivityNotFoundException e) {
            call.reject("no_dialer");
        }
    }

    private void resolveWith(PluginCall call, String method) {
        JSObject result = new JSObject();
        result.put("method", method);
        call.resolve(result);
    }

    private String validNumber(PluginCall call) {
        String number = call.getString("number");
        if (number == null || !E164.matcher(number).matches()) {
            call.reject("invalid_number");
            return null;
        }
        return number;
    }
}
