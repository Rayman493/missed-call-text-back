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
    private String appUrl;

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
        appUrl = webView.getUrl();

        // Check network connectivity BEFORE WebView starts loading
        ConnectivityManager connectivityManager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        boolean hasValidatedNetwork = isNetworkAvailable(connectivityManager);

        if (!hasValidatedNetwork) {
            // Hide WebView immediately to prevent raw error page from showing
            webView.setVisibility(View.GONE);
            showOfflineScreen();
            isWaitingForNetwork = true;
        }

        // Set custom WebViewClient to handle load errors
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                // Only show offline screen if we're not already waiting for network
                // This prevents showing offline screen after network has recovered but load failed
                if (!isWaitingForNetwork) {
                    showOfflineScreen();
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                // Hide offline screen when page loads successfully
                hideOfflineScreen();
            }
        });

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
                if (isWaitingForNetwork) {
                    isWaitingForNetwork = false;
                    runOnUiThread(() -> {
                        hideOfflineScreen();
                        loadAppUrl();
                    });
                }
            }

            @Override
            public void onLost(Network network) {
                // Network lost - show offline screen
                isWaitingForNetwork = true;
                runOnUiThread(() -> showOfflineScreen());
            }
        };

        connectivityManager.registerNetworkCallback(networkRequest, networkCallback);
    }

    private void loadAppUrl() {
        if (appUrl != null && !appUrl.isEmpty()) {
            webView.loadUrl(appUrl);
        } else {
            webView.reload();
        }
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

        // Logo text
        TextView logoText = new TextView(context);
        logoText.setText("ReplyFlow");
        logoText.setTextSize(24);
        logoText.setTextColor(Color.WHITE);
        logoText.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams logoParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        logoParams.setMargins(0, 0, 0, 32);
        layout.addView(logoText, logoParams);

        // Offline icon (using text as simple placeholder)
        TextView iconText = new TextView(context);
        iconText.setText("📵");
        iconText.setTextSize(48);
        iconText.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams iconParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        iconParams.setMargins(0, 0, 0, 24);
        layout.addView(iconText, iconParams);

        // Main message
        TextView messageText = new TextView(context);
        messageText.setText("You're offline");
        messageText.setTextSize(20);
        messageText.setTextColor(Color.WHITE);
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
        retryButton.setText("Try Again");
        retryButton.setBackgroundColor(Color.parseColor("#2563eb")); // blue-600
        retryButton.setTextColor(Color.WHITE);
        retryButton.setPadding(48, 24, 48, 24);
        LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        retryButton.setOnClickListener(v -> {
            // Reload the WebView using the safe loadAppUrl method
            loadAppUrl();
        });
        layout.addView(retryButton, buttonParams);

        return layout;
    }
}
