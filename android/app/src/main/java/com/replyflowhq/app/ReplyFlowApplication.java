package com.replyflowhq.app;

import android.app.Activity;
import android.app.ActivityManager;
import android.app.Application;
import android.content.Context;
import android.os.Build;
import android.os.Bundle;
import android.os.Process;
import android.util.Log;

import com.stripe.stripeterminal.TerminalApplicationDelegate;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class ReplyFlowApplication extends Application implements Application.ActivityLifecycleCallbacks {
    private static final String TAG = "ReplyFlowAppLifecycle";
    private static final String STRIPE_CONTACTLESS_ACTIVITY = "com.stripe.cots.activity.ContactlessPaymentActivity";

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
    }

    private void logLifecycle(Activity activity, String event, boolean hasSavedState) {
        try {
            String className = activity.getClass().getName();
            // Forward only Stripe's contactless Activity telemetry. Host Activity is
            // already instrumented by ReplyflowStripeTerminalPlugin.
            if (!STRIPE_CONTACTLESS_ACTIVITY.equals(className)) {
                return;
            }

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
            nativePayload.put("activityClass", className);
            nativePayload.put("activityInstanceId", instanceId);
            nativePayload.put("taskId", taskId);
            nativePayload.put("isFinishing", isFinishing);
            nativePayload.put("isDestroyed", isDestroyed);
            nativePayload.put("hasWindowFocus", hasWindowFocus);
            nativePayload.put("packageName", packageName);
            nativePayload.put("platform", "android");
            nativePayload.put("timestamp", timestamp);

            JSONObject body = new JSONObject();
            body.put("stage", "TTP_PROCESS_ACTIVITY_" + event.toUpperCase());
            body.put("platform", "android");
            body.put("timestamp", timestamp);
            body.put("native", nativePayload);

            String logLine = "[TTP_PROCESS_ACTIVITY_LIFECYCLE] process=" + processName
                + " pid=" + Process.myPid()
                + " event=" + event
                + " class=" + className
                + " taskId=" + taskId
                + " isFinishing=" + isFinishing
                + " isDestroyed=" + isDestroyed;
            Log.d(TAG, logLine);

            final String payload = body.toString();
            new Thread(() -> postTelemetry(payload)).start();
        } catch (Exception e) {
            Log.w(TAG, "[TTP_PROCESS_ACTIVITY_LIFECYCLE] failed to forward telemetry: " + e.getMessage());
        }
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
                Log.w(TAG, "[TTP_PROCESS_ACTIVITY_LIFECYCLE] endpoint returned " + responseCode);
            }
        } catch (Exception e) {
            Log.w(TAG, "[TTP_PROCESS_ACTIVITY_LIFECYCLE] post failed: " + e.getMessage());
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }
}
