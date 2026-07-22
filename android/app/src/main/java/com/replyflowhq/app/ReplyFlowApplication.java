package com.replyflowhq.app;

import android.app.Application;

import com.stripe.stripeterminal.TerminalApplicationDelegate;

public class ReplyFlowApplication extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        // Required by Stripe Terminal SDK 5.7.0 for lifecycle awareness
        TerminalApplicationDelegate.onCreate(this);
    }
}
