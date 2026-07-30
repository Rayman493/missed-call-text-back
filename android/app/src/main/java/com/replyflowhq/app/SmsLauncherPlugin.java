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
        Log.d(TAG, "openSms entered");
        
        String recipient = call.getString("recipient");
        String body = call.getString("body", "");

        // Validate recipient
        if (recipient == null || recipient.trim().isEmpty()) {
            Log.e(TAG, "Recipient is null or empty");
            call.reject("Recipient is required");
            return;
        }

        // Normalize recipient (remove non-numeric characters except +)
        String normalizedRecipient = recipient.replaceAll("[^0-9+]", "");
        Log.d(TAG, "Sanitized recipient length: " + normalizedRecipient.length());
        
        if (normalizedRecipient.isEmpty()) {
            Log.e(TAG, "Normalized recipient is empty");
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
                Log.d(TAG, "Body length: " + body.length());
            } else {
                Log.d(TAG, "Body is empty");
            }

            // Verify an activity can resolve the intent
            PackageManager packageManager = getContext().getPackageManager();
            boolean canResolve = intent.resolveActivity(packageManager) != null;
            Log.d(TAG, "resolveActivity result: " + canResolve);
            
            if (!canResolve) {
                JSObject result = new JSObject();
                result.put("opened", false);
                result.put("code", "NO_SMS_APP");
                result.put("message", "No messaging app is available.");
                call.resolve(result);
                return;
            }

            // Check if activity is available
            if (getActivity() == null) {
                Log.e(TAG, "Activity is null");
                call.reject("Activity is unavailable", "NO_ACTIVITY");
                return;
            }
            Log.d(TAG, "Activity available");

            // Launch the intent
            Log.d(TAG, "Calling startActivity");
            getActivity().startActivity(intent);
            Log.d(TAG, "startActivity called successfully");

            // Return success
            JSObject result = new JSObject();
            result.put("opened", true);
            call.resolve(result);

        } catch (ActivityNotFoundException e) {
            Log.e(TAG, "ActivityNotFoundException: " + e.getMessage(), e);
            JSObject result = new JSObject();
            result.put("opened", false);
            result.put("code", "NO_ACTIVITY");
            result.put("message", "No app can handle this request.");
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Exception: " + e.getClass().getName() + " - " + e.getMessage(), e);
            call.reject("Failed to launch messaging app: " + e.getMessage());
        }
    }
}
