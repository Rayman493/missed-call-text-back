package com.replyflowhq.app;

import android.app.Activity;
import android.app.ActivityManager;
import android.app.Application;
import android.content.Context;
import android.os.Build;
import android.os.Bundle;
import android.os.Process;
import android.util.Log;
import android.view.View;
import android.view.ViewTreeObserver;
import android.view.Window;

import com.stripe.stripeterminal.TerminalApplicationDelegate;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.Map;

public class ReplyFlowApplication extends Application implements Application.ActivityLifecycleCallbacks {
    private static final String TAG = "ReplyFlowAppLifecycle";
    private static final String STRIPE_CONTACTLESS_ACTIVITY = "com.stripe.cots.activity.ContactlessPaymentActivity";

    private final Map<Activity, String> lastLifecycleEvent = new HashMap<>();
    private final Map<Activity, ViewTreeObserver.OnWindowFocusChangeListener> focusListeners = new HashMap<>();

    @Override
    public void onCreate() {
        super.onCreate();
        // Required by Stripe Terminal SDK 5.7.0 for lifecycle awareness
        TerminalApplicationDelegate.onCreate(this);
        registerActivityLifecycleCallbacks(this);
    }

    @Override
    public void onActivityCreated(Activity activity, Bundle savedInstanceState) {
        logLifecycle(activity, "created", savedInstanceState != null);
    }

    @Override
    public void onActivityStarted(Activity activity) {
        logLifecycle(activity, "started", false);
    }

    @Override
    public void onActivityResumed(Activity activity) {
        logLifecycle(activity, "resumed", false);
    }

    @Override
    public void onActivityPaused(Activity activity) {
        logLifecycle(activity, "paused", false);
    }

    @Override
    public void onActivityStopped(Activity activity) {
        logLifecycle(activity, "stopped", false);
    }

    @Override
    public void onActivitySaveInstanceState(Activity activity, Bundle outState) {
        // no-op
    }

    @Override
    public void onActivityDestroyed(Activity activity) {
        logLifecycle(activity, "destroyed", false);
        detachWindowFocusListener(activity);
    }

    private void logLifecycle(Activity activity, String event, boolean hasSavedState) {
        try {
            String className = activity.getClass().getName();
            // Forward only Stripe's contactless Activity telemetry. Host Activity is
            // already instrumented by ReplyflowStripeTerminalPlugin.
            if (!STRIPE_CONTACTLESS_ACTIVITY.equals(className)) {
                return;
            }

            lastLifecycleEvent.put(activity, event);
            attachWindowFocusListener(activity);

            JSONObject nativePayload = buildCommonNativePayload(activity, event);
            nativePayload.put("hasSavedState", hasSavedState);

            sendTelemetry("TTP_PROCESS_ACTIVITY_" + event.toUpperCase(), nativePayload);
            logLocal("[TTP_PROCESS_ACTIVITY_LIFECYCLE] event=" + event, activity, nativePayload);
        } catch (Exception e) {
            Log.w(TAG, "[TTP_PROCESS_ACTIVITY_LIFECYCLE] failed to forward telemetry: " + e.getMessage());
        }
    }

    private void attachWindowFocusListener(final Activity activity) {
        if (focusListeners.containsKey(activity)) {
            return;
        }
        try {
            final Window window = activity.getWindow();
            if (window == null) {
                return;
            }
            final View decorView = window.getDecorView();
            ViewTreeObserver.OnWindowFocusChangeListener listener = hasFocus -> forwardWindowFocus(activity, hasFocus);
            decorView.getViewTreeObserver().addOnWindowFocusChangeListener(listener);
            focusListeners.put(activity, listener);
        } catch (Exception e) {
            Log.w(TAG, "[TTP_PROCESS_ACTIVITY_WINDOW_FOCUS] failed to attach listener: " + e.getMessage());
        }
    }

    private void detachWindowFocusListener(Activity activity) {
        ViewTreeObserver.OnWindowFocusChangeListener listener = focusListeners.remove(activity);
        lastLifecycleEvent.remove(activity);
        if (listener == null) {
            return;
        }
        try {
            Window window = activity.getWindow();
            if (window != null) {
                View decorView = window.getDecorView();
                if (decorView != null) {
                    decorView.getViewTreeObserver().removeOnWindowFocusChangeListener(listener);
                }
            }
        } catch (Exception ignored) {}
    }

    private void forwardWindowFocus(Activity activity, boolean hasFocus) {
        try {
            String className = activity.getClass().getName();
            if (!STRIPE_CONTACTLESS_ACTIVITY.equals(className)) {
                return;
            }
            JSONObject nativePayload = buildCommonNativePayload(activity, "windowFocus");
            nativePayload.put("hasFocus", hasFocus);
            nativePayload.put("lifecycleState", lastLifecycleEvent.get(activity));

            View decorView = null;
            try {
                decorView = activity.getWindow().getDecorView();
            } catch (Exception ignored) {}

            if (decorView != null) {
                nativePayload.put("decorViewVisibility", decorView.getVisibility());
                nativePayload.put("systemUiVisibility", decorView.getSystemUiVisibility());
                nativePayload.put("windowFlags", activity.getWindow().getAttributes().flags);
            }

            sendTelemetry("TTP_PROCESS_ACTIVITY_WINDOW_FOCUS", nativePayload);
            logLocal("[TTP_PROCESS_ACTIVITY_WINDOW_FOCUS] hasFocus=" + hasFocus, activity, nativePayload);
        } catch (Exception e) {
            Log.w(TAG, "[TTP_PROCESS_ACTIVITY_WINDOW_FOCUS] failed to forward telemetry: " + e.getMessage());
        }
    }

    private JSONObject buildCommonNativePayload(Activity activity, String event) throws Exception {
        String processName = getProcessNameCompat();
        int taskId = activity.getTaskId();
        String instanceId = Integer.toHexString(System.identityHashCode(activity));
        boolean isFinishing = activity.isFinishing();
        boolean isDestroyed = Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1 && activity.isDestroyed();
        boolean hasWindowFocus = activity.hasWindowFocus();
        String packageName = activity.getPackageName();
        long timestamp = System.currentTimeMillis();

        JSONObject nativePayload = new JSONObject();
        nativePayload.put("event", event);
        nativePayload.put("processName", processName);
        nativePayload.put("activityClass", activity.getClass().getName());
        nativePayload.put("activityInstanceId", instanceId);
        nativePayload.put("taskId", taskId);
        nativePayload.put("isFinishing", isFinishing);
        nativePayload.put("isDestroyed", isDestroyed);
        nativePayload.put("hasWindowFocus", hasWindowFocus);
        nativePayload.put("packageName", packageName);
        nativePayload.put("platform", "android");
        nativePayload.put("timestamp", timestamp);
        return nativePayload;
    }

    private void sendTelemetry(String stage, JSONObject nativePayload) {
        try {
            long timestamp = System.currentTimeMillis();
            JSONObject body = new JSONObject();
            body.put("stage", stage);
            body.put("platform", "android");
            body.put("timestamp", timestamp);
            body.put("native", nativePayload);
            final String payload = body.toString();
            new Thread(() -> postTelemetry(payload)).start();
        } catch (Exception e) {
            Log.w(TAG, "[TTP_PROCESS_ACTIVITY] failed to build telemetry: " + e.getMessage());
        }
    }

    private void logLocal(String prefix, Activity activity, JSONObject nativePayload) {
        try {
            String processName = nativePayload.optString("processName", "unknown");
            String instanceId = nativePayload.optString("activityInstanceId", "unknown");
            int taskId = nativePayload.optInt("taskId", -1);
            boolean isFinishing = nativePayload.optBoolean("isFinishing", false);
            boolean isDestroyed = nativePayload.optBoolean("isDestroyed", false);
            Log.d(TAG, prefix
                + " process=" + processName
                + " pid=" + Process.myPid()
                + " class=" + activity.getClass().getName()
                + " instance=" + instanceId
                + " taskId=" + taskId
                + " isFinishing=" + isFinishing
                + " isDestroyed=" + isDestroyed);
        } catch (Exception ignored) {}
    }

    private String getProcessNameCompat() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            return getProcessName();
        }
        int pid = Process.myPid();
        ActivityManager manager = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
        if (manager != null && manager.getRunningAppProcesses() != null) {
            for (ActivityManager.RunningAppProcessInfo process : manager.getRunningAppProcesses()) {
                if (process.pid == pid) {
                    return process.processName;
                }
            }
        }
        return "unknown";
    }

    private void postTelemetry(String payload) {
        HttpURLConnection connection = null;
        try {
            String endpoint = BuildConfig.TTP_DIAGNOSTICS_ENDPOINT;
            URL url = new URL(endpoint);
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setConnectTimeout(5000);
            connection.setReadTimeout(5000);
            connection.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
            byte[] bytes = payload.getBytes("UTF-8");
            connection.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream os = connection.getOutputStream()) {
                os.write(bytes);
            }
            int responseCode = connection.getResponseCode();
            if (responseCode < 200 || responseCode >= 300) {
                Log.w(TAG, "[TTP_PROCESS_ACTIVITY] endpoint returned " + responseCode);
            }
        } catch (Exception e) {
            Log.w(TAG, "[TTP_PROCESS_ACTIVITY] post failed: " + e.getMessage());
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }
}
