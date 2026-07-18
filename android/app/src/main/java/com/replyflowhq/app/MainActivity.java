package com.replyflowhq.app;

import android.content.Context;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import android.app.NotificationChannel;
import android.app.NotificationManager;

public class MainActivity extends BridgeActivity {
    private View offlineView;
    private WebView webView;
    private ConnectivityManager.NetworkCallback networkCallback;
    private boolean isWaitingForNetwork = false;
    private boolean hasLoadedSuccessfully = false;
    private boolean launchedInOfflineState = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Create notification channel for Android O+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                "replyflow-high",
                "ReplyFlow Alerts",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("High-value ReplyFlow notifications");
            NotificationManager manager = getSystemService(NotificationManager.class);
            manager.createNotificationChannel(channel);
        }

        // Get the Capacitor WebView
        webView = getBridge().getWebView();

        // Check network connectivity at startup
        ConnectivityManager connectivityManager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        boolean hasValidatedNetwork = isNetworkAvailable(connectivityManager);

        if (!hasValidatedNetwork) {
            // Show offline screen immediately if no network at startup
            // This covers the WebView before Capacitor's initial load completes
            showOfflineScreen();
            isWaitingForNetwork = true;
            launchedInOfflineState = true;
        }

        // Set up network callback to detect connectivity changes
        setupNetworkMonitoring();
    }

    private void setupNetworkMonitoring() {
        ConnectivityManager connectivityManager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);

        if (connectivityManager == null) {
            return;
        }

        // Set up network callback to detect connectivity changes
        NetworkRequest networkRequest = new NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .addCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
            .build();

        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                // Network became available with validated internet access
                // Only restart if we launched in offline state and haven't loaded successfully yet
                if (isWaitingForNetwork && !hasLoadedSuccessfully && launchedInOfflineState) {
                    isWaitingForNetwork = false;
                    runOnUiThread(() -> {
                        // Recreate activity to perform fresh normal startup
                        // This preserves WebView storage, cookies, and auth state
                        recreate();
                    });
                }
            }

            @Override
            public void onLost(Network network) {
                // Only show offline screen if we haven't loaded successfully yet
                // Once loaded, let React/Capacitor handle runtime offline
                if (!hasLoadedSuccessfully) {
                    isWaitingForNetwork = true;
                    runOnUiThread(() -> showOfflineScreen());
                }
            }
        };

        connectivityManager.registerNetworkCallback(networkRequest, networkCallback);
    }

    private boolean isNetworkAvailable(ConnectivityManager connectivityManager) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            android.net.Network network = connectivityManager.getActiveNetwork();
            if (network == null) {
                return false;
            }
            NetworkCapabilities capabilities = connectivityManager.getNetworkCapabilities(network);
            return capabilities != null &&
                   capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                   capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
        } else {
            // Fallback for older Android versions
            android.net.NetworkInfo networkInfo = connectivityManager.getActiveNetworkInfo();
            return networkInfo != null && networkInfo.isConnected();
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        // Unregister network callback to prevent memory leaks
        if (networkCallback != null) {
            ConnectivityManager connectivityManager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (connectivityManager != null) {
                connectivityManager.unregisterNetworkCallback(networkCallback);
            }
        }
    }

    private void showOfflineScreen() {
        if (offlineView == null) {
            offlineView = createOfflineView();
        }

        if (offlineView.getParent() == null) {
            // Add offline view to the root layout using generic ViewGroup
            ViewGroup rootLayout = (ViewGroup) webView.getParent();
            if (rootLayout != null) {
                rootLayout.addView(offlineView, 0);
            }
        }

        webView.setVisibility(View.GONE);
        offlineView.setVisibility(View.VISIBLE);
    }

    private void hideOfflineScreen() {
        if (offlineView != null && offlineView.getVisibility() == View.VISIBLE) {
            offlineView.setVisibility(View.GONE);
            webView.setVisibility(View.VISIBLE);
        }
    }

    private View createOfflineView() {
        Context context = this;
        LinearLayout layout = new LinearLayout(context);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER);
        layout.setBackgroundColor(Color.parseColor("#020617")); // slate-950
        layout.setPadding(48, 48, 48, 48);

        // Logo with ReplyFlow and HQ branding
        LinearLayout logoLayout = new LinearLayout(context);
        logoLayout.setOrientation(LinearLayout.HORIZONTAL);
        logoLayout.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams logoLayoutParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        logoLayoutParams.setMargins(0, 0, 0, 32);

        TextView logoText = new TextView(context);
        logoText.setText("ReplyFlow");
        logoText.setTextSize(24);
        logoText.setTextColor(Color.WHITE);
        logoText.setTypeface(null, android.graphics.Typeface.BOLD);
        LinearLayout.LayoutParams logoTextParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        logoLayout.addView(logoText, logoTextParams);

        TextView hqText = new TextView(context);
        hqText.setText("HQ");
        hqText.setTextSize(24);
        hqText.setTextColor(Color.parseColor("#60a5fa")); // blue-400
        hqText.setTypeface(null, android.graphics.Typeface.BOLD);
        LinearLayout.LayoutParams hqTextParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        hqTextParams.setMargins(4, 0, 0, 0);
        logoLayout.addView(hqText, hqTextParams);

        layout.addView(logoLayout, logoLayoutParams);

        // Offline icon container (circle background)
        LinearLayout iconContainer = new LinearLayout(context);
        iconContainer.setOrientation(LinearLayout.VERTICAL);
        iconContainer.setGravity(Gravity.CENTER);
        iconContainer.setBackgroundColor(Color.parseColor("#1e293b")); // slate-800
        iconContainer.setPadding(32, 32, 32, 32);
        LinearLayout.LayoutParams iconContainerParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        iconContainerParams.setMargins(0, 0, 0, 24);

        // Offline icon (using text as placeholder - would use drawable if available)
        TextView iconText = new TextView(context);
        iconText.setText("📵");
        iconText.setTextSize(48);
        iconText.setGravity(Gravity.CENTER);
        iconContainer.addView(iconText);

        layout.addView(iconContainer, iconContainerParams);

        // Main message
        TextView messageText = new TextView(context);
        messageText.setText("You're offline");
        messageText.setTextSize(24);
        messageText.setTextColor(Color.WHITE);
        messageText.setTypeface(null, android.graphics.Typeface.BOLD);
        messageText.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams messageParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        messageParams.setMargins(0, 0, 0, 8);
        layout.addView(messageText, messageParams);

        // Subtitle
        TextView subtitleText = new TextView(context);
        subtitleText.setText("Check your internet connection and try again.");
        subtitleText.setTextSize(14);
        subtitleText.setTextColor(Color.parseColor("#94a3b8")); // slate-400
        subtitleText.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams subtitleParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        subtitleParams.setMargins(0, 0, 0, 16);
        layout.addView(subtitleText, subtitleParams);

        // Supporting text
        TextView supportingText = new TextView(context);
        supportingText.setText("ReplyFlow requires an internet connection to load your latest customers, messages, jobs, and schedule.");
        supportingText.setTextSize(12);
        supportingText.setTextColor(Color.parseColor("#64748b")); // slate-500
        supportingText.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams supportingParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        supportingParams.setMargins(0, 0, 0, 24);
        layout.addView(supportingText, supportingParams);

        // Try Again button
        Button retryButton = new Button(context);
        retryButton.setText("TRY AGAIN");
        retryButton.setBackgroundColor(Color.parseColor("#2563eb")); // blue-600
        retryButton.setTextColor(Color.WHITE);
        retryButton.setPadding(48, 24, 48, 24);
        retryButton.setAllCaps(false);
        LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        retryButton.setOnClickListener(v -> {
            // Reload the WebView
            webView.reload();
        });
        layout.addView(retryButton, buttonParams);

        return layout;
    }
}
