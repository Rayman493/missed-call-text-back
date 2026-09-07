package com.replyflowhq.app;

import android.app.Activity;
import android.app.Application;
import android.os.Build;
import android.os.Bundle;
import android.os.Process;
import android.util.Log;

import com.stripe.stripeterminal.TerminalApplicationDelegate;

public class ReplyFlowApplication extends Application implements Application.ActivityLifecycleCallbacks {
    private static final String TAG = "ReplyFlowAppLifecycle";

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
            String processName = "unknown";
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                processName = getProcessName();
            }
            String className = activity.getClass().getName();
            int taskId = activity.getTaskId();
            StringBuilder sb = new StringBuilder();
            sb.append("[TTP_PROCESS_ACTIVITY_LIFECYCLE] process=").append(processName)
              .append(" pid=").append(Process.myPid())
              .append(" event=").append(event)
              .append(" class=").append(className)
              .append(" taskId=").append(taskId)
              .append(" isFinishing=").append(activity.isFinishing());
            if (hasSavedState) {
                sb.append(" hasSavedState=true");
            }
            Log.d(TAG, sb.toString());
        } catch (Exception ignored) {}
    }
}
