package com.replyflowhq.app;

import androidx.annotation.NonNull;
import android.util.Log;
import android.content.Intent;
import android.net.Uri;
import android.content.pm.PackageManager;
import android.content.ActivityNotFoundException;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SmsLauncher")
public class SmsLauncherPlugin extends Plugin {
    private static final String TAG = "SmsLauncher";

    @PluginMethod
    public void openSms(PluginCall call) {
        String recipient = call.getString("recipient");
        String body = call.getString("body", "");

        // Validate recipient
        if (recipient == null || recipient.trim().isEmpty()) {
            call.reject("Recipient is required");
            return;
        }

        // Normalize recipient (remove non-numeric characters except +)
        String normalizedRecipient = recipient.replaceAll("[^0-9+]", "");
        if (normalizedRecipient.isEmpty()) {
            call.reject("Invalid recipient number");
            return;
        }

        try {
            // Create SMS intent using ACTION_SENDTO with smsto: URI
            Intent intent = new Intent(Intent.ACTION_SENDTO);
            intent.setData(Uri.parse("smsto:" + normalizedRecipient));
            
            // Add message body if provided
            if (body != null && !body.trim().isEmpty()) {
                intent.putExtra("sms_body", body);
            }

            // Verify an activity can resolve the intent
            PackageManager packageManager = getContext().getPackageManager();
            if (intent.resolveActivity(packageManager) == null) {
                JSObject result = new JSObject();
                result.put("opened", false);
                result.put("code", "NO_SMS_APP");
                result.put("message", "No messaging app is available.");
                call.resolve(result);
                return;
            }

            // Launch the intent
            startActivity(intent);

            // Return success
            JSObject result = new JSObject();
            result.put("opened", true);
            call.resolve(result);

        } catch (ActivityNotFoundException e) {
            Log.e(TAG, "No activity found to handle SMS intent", e);
            JSObject result = new JSObject();
            result.put("opened", false);
            result.put("code", "NO_ACTIVITY");
            result.put("message", "No app can handle this request.");
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Failed to launch SMS", e);
            call.reject("Failed to launch messaging app: " + e.getMessage());
        }
    }
}
