package com.replyflowhq.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.util.Log;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.browser.customtabs.CustomTabsSession;
import androidx.browser.customtabs.CustomTabsClient;
import androidx.browser.customtabs.CustomTabsServiceConnection;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * ReplyflowWebCheckoutPlugin
 *
 * Production Capacitor plugin for native Android Stripe checkout using Browser.open() with callback interception.
 *
 * Purpose: Provide automatic return-to-app behavior for native Android Stripe checkout
 * by using Browser.open() with App Link callback interception through MainActivity, which preserves
 * Capacitor WebView Supabase/localStorage sessions.
 *
 * Security: This plugin only returns safe checkout metadata. No auth tokens,
 * cookies, or session contents are passed through native code.
 *
 * Architecture:
 * - Plugin stores pending checkout state
 * - Plugin calls Browser.open() to launch Chrome Custom Tab
 * - MainActivity intercepts App Link callback and forwards to plugin
 * - Plugin resolves promise when callback is received
 * - WebView remains intact underneath
 * - No storage flags, polling, or appStateChange coordination needed
 * - Callback ownership is explicit (plugin receives it via MainActivity)
 * - Returns safe metadata only
 */
@CapacitorPlugin(name = "ReplyflowWebCheckoutPlugin")
public class ReplyflowWebCheckoutPlugin extends Plugin {
    private static final String TAG = "NATIVE_CHECKOUT";
    private static final String PREFS_NAME = "replyflow_checkout_pending";
    private static final String KEY_PENDING = "pending_checkout";
    private static final String KEY_CALLBACK_HOST = "callback_host";
    private static final String KEY_CALLBACK_PATH = "callback_path";
    private static final String KEY_TIMESTAMP = "timestamp";
    private static final String KEY_RECOVERY_COMPLETED = "recovery_completed";
    private static final String KEY_RECOVERY_CALLBACK_MATCHED = "recovery_callback_matched";
    private static final String KEY_RECOVERY_CALLBACK_URL = "recovery_callback_url";
    private static final String KEY_RECOVERY_CANCELED = "recovery_canceled";
    private static final String KEY_RECOVERY_ERROR_CODE = "recovery_error_code";
    private static final String KEY_RECOVERY_ERROR_MESSAGE = "recovery_error_message";

    // Retain the active plugin call to prevent garbage collection
    private PluginCall activeCall = null;

    // Guard against double promise resolution
    private boolean completionCalled = false;

    // Custom Tabs session and client
    private CustomTabsSession customTabsSession = null;
    private CustomTabsClient customTabsClient = null;

    // SharedPreferences for process-death recovery
    private SharedPreferences prefs;

    // Cancellation detection
    private long launchTimestamp = 0;

    @Override
    public void load() {
        Log.d(TAG, "[NATIVE_CHECKOUT] plugin_loaded=true");
        prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    @PluginMethod
    public void openCheckoutSession(PluginCall call) {
        // Check for recovered completion from process death
        if (hasRecoveredCompletion()) {
            Log.d(TAG, "[NATIVE_CHECKOUT] recovered_completion_found=true");
            JSObject recoveredResult = consumeRecoveredCompletion();
            if (recoveredResult != null) {
                call.resolve(recoveredResult);
                return;
            }
        }

        // Reset completion guard
        completionCalled = false;

        // Get parameters
        String checkoutUrl = call.getString("url");
        if (checkoutUrl == null) {
            call.reject("Missing required parameter: url");
            return;
        }

        String callbackHost = call.getString("callbackHost", "www.replyflowhq.com");
        String callbackPath = call.getString("callbackPath", "/billing/success");

        Log.d(TAG, "[NATIVE_CHECKOUT] open_requested=true");
        Log.d(TAG, "[NATIVE_CHECKOUT] callback_host=" + callbackHost);
        Log.d(TAG, "[NATIVE_CHECKOUT] callback_path=" + callbackPath);

        // Store the active call to resolve later
        activeCall = call;
        call.setKeepAlive(true);

        // Store pending state for process-death recovery
        storePendingState(callbackHost, callbackPath);

        // Record launch timestamp for cancellation detection
        launchTimestamp = System.currentTimeMillis();

        // Launch Custom Tab explicitly
        launchCustomTab(checkoutUrl);
    }

    private void launchCustomTab(String checkoutUrl) {
        try {
            Activity activity = getActivity();
            if (activity == null) {
                rejectActiveCall("Activity is unavailable");
                return;
            }

            Uri uri = Uri.parse(checkoutUrl);

            // Build Custom Tabs Intent
            CustomTabsIntent.Builder builder = new CustomTabsIntent.Builder();
            builder.setShowTitle(true);
            builder.setUrlBarHidingEnabled(false);
            builder.setToolbarColor(android.graphics.Color.WHITE);

            CustomTabsIntent customTabsIntent = builder.build();

            Log.d(TAG, "[NATIVE_CHECKOUT] custom_tab_launching=true");

            // Launch Custom Tab explicitly
            customTabsIntent.launchUrl(activity, uri);

            Log.d(TAG, "[NATIVE_CHECKOUT] custom_tab_launched=true");

            // DO NOT resolve promise here - wait for callback
            // The promise is resolved in handleCompletion when the callback fires

        } catch (Exception e) {
            Log.e(TAG, "[NATIVE_CHECKOUT] custom_tab_launch_failed=true", e);
            clearPendingState();
            rejectActiveCall("Failed to launch Custom Tab: " + e.getMessage());
        }
    }

    /**
     * Handle checkout completion (success or cancel)
     */
    private void handleCompletion(Uri callbackUri, Exception error) {
        // Idempotency guard - prevent double resolution
        if (completionCalled) {
            Log.d(TAG, "[NATIVE_CHECKOUT] completion_already_called=true");
            return;
        }
        completionCalled = true;

        Log.d(TAG, "[NATIVE_CHECKOUT] completion_processing=true");

        // Clear pending state
        clearPendingState();

        JSObject result = new JSObject();

        // Add Android version
        String androidVersion = Build.VERSION.RELEASE;
        result.put("androidVersion", androidVersion);

        if (error != null) {
            result.put("completed", false);
            result.put("errorCode", "BROWSER_ERROR");
            result.put("errorMessage", error.getMessage());
            result.put("callbackMatched", false);
            Log.d(TAG, "[NATIVE_CHECKOUT] completion_error=true");
        } else {
            result.put("completed", true);
            result.put("callbackMatched", true);
            result.put("callbackUrl", callbackUri.toString());
            Log.d(TAG, "[NATIVE_CHECKOUT] completion_success=true");
        }

        // Resolve the active call
        if (activeCall != null) {
            activeCall.resolve(result);
            activeCall = null;
        } else {
            Log.d(TAG, "[NATIVE_CHECKOUT] no_active_call_storing_recovery=true");
            // No active call - store for process-death recovery
            storeRecoveredCompletion(result);
        }
    }

    /**
     * Handle user cancellation (back button, close Custom Tab)
     */
    public void handleCancellation() {
        Log.d(TAG, "[NATIVE_CHECKOUT_CANCEL] handleCancellation_entered=true");
        Log.d(TAG, "[NATIVE_CHECKOUT_CANCEL] activeCall_not_null=" + (activeCall != null));
        Log.d(TAG, "[NATIVE_CHECKOUT] user_cancellation=true");
        clearPendingState();

        // Emit cancellation event to JS
        Log.d(TAG, "[NATIVE_CHECKOUT_CANCEL] checkout_canceled_event_emitting=true");
        notifyListeners("checkoutCanceled", new JSObject());
        Log.d(TAG, "[NATIVE_CHECKOUT_CANCEL] checkout_canceled_event_emitted=true");

        JSObject result = new JSObject();
        result.put("androidVersion", Build.VERSION.RELEASE);
        result.put("completed", false);
        result.put("canceled", true);
        result.put("callbackMatched", false);

        // Resolve the active call
        if (activeCall != null) {
            activeCall.resolve(result);
            activeCall = null;
            Log.d(TAG, "[NATIVE_CHECKOUT_CANCEL] resolved_active_call_success=true");
        } else {
            Log.d(TAG, "[NATIVE_CHECKOUT_CANCEL] storing_recovered_completion=true");
            storeRecoveredCompletion(result);
        }
        completionCalled = true;
        Log.d(TAG, "[NATIVE_CHECKOUT_CANCEL] handleCancellation_complete=true");
    }

    /**
     * Check if app resumed without callback (possible cancellation)
     * Called by MainActivity on app resume
     * NOTE: This is a fallback. Primary cancellation detection happens in onNewIntent
     * to avoid race conditions where onNewIntent with valid callback fires after onResume.
     */
    public void checkForCancellation() {
        Log.d(TAG, "[NATIVE_CHECKOUT_CANCEL] cancellation_check_entered=true");
        Log.d(TAG, "[NATIVE_CHECKOUT_CANCEL] activeCheckout=" + hasActiveCheckout());
        Log.d(TAG, "[NATIVE_CHECKOUT_CANCEL] completionCalled=" + completionCalled);

        if (!hasActiveCheckout() || completionCalled) {
            Log.d(TAG, "[NATIVE_CHECKOUT_CANCEL] early_return_no_active_or_completed=true");
            return;
        }

        long elapsed = System.currentTimeMillis() - launchTimestamp;
        Log.d(TAG, "[NATIVE_CHECKOUT_CANCEL] elapsedMs=" + elapsed);

        // Only cancel if > 2 seconds have elapsed (avoid launch noise)
        // No upper bound - even if user spent 90 seconds in Stripe, Back should cancel
        if (elapsed >= 2000) {
            Log.d(TAG, "[NATIVE_CHECKOUT_CANCEL] cancellation_resolving=true");
            Log.d(TAG, "[NATIVE_CHECKOUT] resume_cancellation_detected_elapsed_ms=" + elapsed);
            handleCancellation();
        } else {
            Log.d(TAG, "[NATIVE_CHECKOUT_CANCEL] too_early_elapsedMs=" + elapsed);
        }
    }

    /**
     * Called by MainActivity when onNewIntent receives a callback that was NOT consumed
     * This indicates the user returned to the app without a valid checkout callback
     */
    public void handleReturnWithoutCallback() {
        if (!hasActiveCheckout() || completionCalled) {
            return;
        }

        long elapsed = System.currentTimeMillis() - launchTimestamp;
        // If returned without valid callback after >= 2 seconds, treat as cancellation
        // No upper bound - even long sessions should cancel on Back
        if (elapsed >= 2000) {
            Log.d(TAG, "[NATIVE_CHECKOUT] return_without_callback_elapsed_ms=" + elapsed);
            handleCancellation();
        }
    }

    /**
     * Store pending state for process-death recovery
     */
    private void storePendingState(String callbackHost, String callbackPath) {
        prefs.edit()
            .putBoolean(KEY_PENDING, true)
            .putString(KEY_CALLBACK_HOST, callbackHost)
            .putString(KEY_CALLBACK_PATH, callbackPath)
            .putLong(KEY_TIMESTAMP, System.currentTimeMillis())
            .apply();
        Log.d(TAG, "[NATIVE_CHECKOUT] pending_state_stored=true");
    }

    /**
     * Clear pending state
     */
    private void clearPendingState() {
        prefs.edit()
            .clear()
            .apply();
        Log.d(TAG, "[NATIVE_CHECKOUT] pending_state_cleared=true");
    }

    /**
     * Store recovered completion for process-death recovery
     */
    private void storeRecoveredCompletion(JSObject result) {
        prefs.edit()
            .putBoolean(KEY_RECOVERY_COMPLETED, true)
            .putBoolean(KEY_RECOVERY_CALLBACK_MATCHED, result.optBoolean("callbackMatched", false))
            .putString(KEY_RECOVERY_CALLBACK_URL, result.optString("callbackUrl", null))
            .putBoolean(KEY_RECOVERY_CANCELED, result.optBoolean("canceled", false))
            .putString(KEY_RECOVERY_ERROR_CODE, result.optString("errorCode", null))
            .putString(KEY_RECOVERY_ERROR_MESSAGE, result.optString("errorMessage", null))
            .putLong(KEY_TIMESTAMP, System.currentTimeMillis())
            .apply();
        Log.d(TAG, "[NATIVE_CHECKOUT] recovery_completion_stored=true");
    }

    /**
     * Check if there's a recovered completion
     */
    private boolean hasRecoveredCompletion() {
        boolean hasRecovery = prefs.getBoolean(KEY_RECOVERY_COMPLETED, false);
        long timestamp = prefs.getLong(KEY_TIMESTAMP, 0);

        // Expire recovery after 1 hour
        if (hasRecovery && timestamp > 0) {
            long elapsed = System.currentTimeMillis() - timestamp;
            if (elapsed > 60 * 60 * 1000) {
                Log.d(TAG, "[NATIVE_CHECKOUT] recovery_expired=true");
                clearPendingState();
                return false;
            }
        }

        return hasRecovery;
    }

    /**
     * Consume recovered completion
     */
    private JSObject consumeRecoveredCompletion() {
        JSObject result = new JSObject();

        boolean completed = prefs.getBoolean(KEY_RECOVERY_COMPLETED, false);
        boolean callbackMatched = prefs.getBoolean(KEY_RECOVERY_CALLBACK_MATCHED, false);
        String callbackUrl = prefs.getString(KEY_RECOVERY_CALLBACK_URL, null);
        boolean canceled = prefs.getBoolean(KEY_RECOVERY_CANCELED, false);
        String errorCode = prefs.getString(KEY_RECOVERY_ERROR_CODE, null);
        String errorMessage = prefs.getString(KEY_RECOVERY_ERROR_MESSAGE, null);

        String androidVersion = Build.VERSION.RELEASE;
        result.put("androidVersion", androidVersion);
        result.put("completed", completed);
        result.put("callbackMatched", callbackMatched);
        if (callbackUrl != null) {
            result.put("callbackUrl", callbackUrl);
        }
        if (canceled) {
            result.put("canceled", true);
        }
        if (errorCode != null) {
            result.put("errorCode", errorCode);
        }
        if (errorMessage != null) {
            result.put("errorMessage", errorMessage);
        }

        // Clear recovery state after consuming
        clearPendingState();

        Log.d(TAG, "[NATIVE_CHECKOUT] recovery_completion_consumed=true");
        return result;
    }

    /**
     * Check if there's a pending checkout (for process-death recovery)
     */
    public boolean hasPendingCheckout() {
        boolean pending = prefs.getBoolean(KEY_PENDING, false);
        long timestamp = prefs.getLong(KEY_TIMESTAMP, 0);

        // Expire pending state after 1 hour to prevent stale state
        if (pending && timestamp > 0) {
            long elapsed = System.currentTimeMillis() - timestamp;
            if (elapsed > 60 * 60 * 1000) {
                Log.d(TAG, "[NATIVE_CHECKOUT] pending_state_expired=true");
                clearPendingState();
                return false;
            }
        }

        return pending;
    }

    /**
     * Reject the active call with error
     */
    private void rejectActiveCall(String message) {
        if (activeCall != null) {
            activeCall.reject(message);
            activeCall = null;
        }
        completionCalled = true;
    }

    /**
     * Public method for MainActivity to check if plugin has an active checkout
     */
    public boolean hasActiveCheckout() {
        return activeCall != null && !completionCalled;
    }

    /**
     * Public method for MainActivity to forward App Link callback to plugin
     * @return true if callback was consumed, false if not (should fall through to normal processing)
     */
    public boolean forwardCallback(Uri callbackUri) {
        if (!hasActiveCheckout()) {
            Log.d(TAG, "[NATIVE_CHECKOUT] forward_callback_no_active_checkout=true");
            return false;
        }

        String scheme = callbackUri.getScheme();
        String host = callbackUri.getHost();
        String path = callbackUri.getPath();
        String queryString = callbackUri.getQuery();

        Log.d(TAG, "[NATIVE_CHECKOUT] forward_callback_received=true");
        Log.d(TAG, "[NATIVE_CHECKOUT] forward_callback_scheme=" + scheme);
        Log.d(TAG, "[NATIVE_CHECKOUT] forward_callback_host=" + host);
        Log.d(TAG, "[NATIVE_CHECKOUT] forward_callback_path=" + path);
        Log.d(TAG, "[NATIVE_CHECKOUT] forward_callback_query=" + queryString);

        // Validate callback URI
        if (!validateCallbackUri(scheme, host, path, queryString)) {
            Log.d(TAG, "[NATIVE_CHECKOUT] forward_callback_not_consumed=true");
            return false;
        }

        // Callback matched - consume and complete
        String sessionId = extractSessionId(queryString);
        Log.d(TAG, "[NATIVE_CHECKOUT] forward_callback_matched=true session_id=" + sessionId.substring(0, 8));
        handleCompletion(callbackUri, null);
        return true;
    }

    /**
     * Validate callback URI components
     * @return true if valid, false if invalid
     */
    private boolean validateCallbackUri(String scheme, String host, String path, String queryString) {
        // Validate scheme
        if (!"https".equals(scheme)) {
            Log.d(TAG, "[NATIVE_CHECKOUT] validation_failed_invalid_scheme=true");
            return false;
        }

        // Check if this matches our expected callback
        String expectedHost = prefs.getString(KEY_CALLBACK_HOST, null);
        String expectedPath = prefs.getString(KEY_CALLBACK_PATH, null);

        if (expectedHost == null || expectedPath == null) {
            Log.d(TAG, "[NATIVE_CHECKOUT] validation_failed_no_expected_values=true");
            return false;
        }

        if (!expectedHost.equals(host) || !expectedPath.equals(path)) {
            Log.d(TAG, "[NATIVE_CHECKOUT] validation_failed_host_path_mismatch=true");
            return false;
        }

        // Validate session_id exists and has plausible format
        String sessionId = extractSessionId(queryString);
        if (sessionId == null) {
            Log.d(TAG, "[NATIVE_CHECKOUT] validation_failed_missing_session_id=true");
            return false;
        }

        if (!isValidSessionId(sessionId)) {
            Log.d(TAG, "[NATIVE_CHECKOUT] validation_failed_invalid_session_id=true");
            return false;
        }

        return true;
    }

    /**
     * Extract session_id from query string
     * Package-private for testing
     */
    String extractSessionId(String queryString) {
        if (queryString == null) {
            return null;
        }

        String[] params = queryString.split("&");
        for (String param : params) {
            String[] keyValue = param.split("=", 2);
            if (keyValue.length == 2 && "session_id".equals(keyValue[0])) {
                return keyValue[1];
            }
        }
        return null;
    }

    /**
     * Validate session_id has plausible Stripe Checkout Session format
     * Stripe session IDs start with "cs_" followed by alphanumeric characters
     * Package-private for testing
     */
    boolean isValidSessionId(String sessionId) {
        if (sessionId == null || sessionId.length() < 10) {
            return false;
        }
        // Stripe session IDs start with "cs_"
        return sessionId.startsWith("cs_");
    }
}