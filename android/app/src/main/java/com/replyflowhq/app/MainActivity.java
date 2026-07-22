package com.replyflowhq.app;

import android.content.Context;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import com.replyflowhq.terminal.ReplyflowStripeTerminalPlugin;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "ReplyFlowOffline";
    private View offlineView;
    private WebView webView;
    private ConnectivityManager.NetworkCallback networkCallback;
    private boolean isWaitingForNetwork = false;
    private boolean hasLoadedSuccessfully = false;
    private boolean launchedInOfflineState = false;
    private boolean isRecreating = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register custom local plugin for Stripe Terminal BEFORE super.onCreate()
        // Per Capacitor documentation: registerPlugin must come before super.onCreate()
        Log.d(TAG, "[PLUGIN] Registering ReplyflowStripeTerminalPlugin...");
        registerPlugin(ReplyflowStripeTerminalPlugin.class);
        Log.d(TAG, "[PLUGIN] ReplyflowStripeTerminalPlugin registered successfully");

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

        // Get the Capacitor WebView (used for offline overlay parent)
        webView = getBridge().getWebView();

        // Attach a BridgeWebViewClient to observe page lifecycle and mark successful initialization
        webView.setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                try {
                    Uri uri = Uri.parse(url);
                    String host = uri.getHost();
                    String path = uri.getPath();
                    Log.d(TAG, "onPageStarted: host=" + host + ", path=" + path);
                } catch (Exception e) {
                    Log.d(TAG, "onPageStarted: url parse error");
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                boolean wasLoaded = hasLoadedSuccessfully;
                hasLoadedSuccessfully = true;
                try {
                    Uri uri = Uri.parse(url);
                    String host = uri.getHost();
                    String path = uri.getPath();
                    Log.d(TAG, "onPageFinished: host=" + host + ", path=" + path + ", hasLoadedSuccessfully " + (wasLoaded ? "(already true)" : "false -> true"));
                } catch (Exception e) {
                    Log.d(TAG, "onPageFinished: url parse error, hasLoadedSuccessfully set true");
                }
                runOnUiThread(() -> hideOfflineScreen());
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                super.onReceivedError(view, errorCode, description, failingUrl);
                Log.d(TAG, "onReceivedError(legacy): code=" + errorCode + ", mainFrame=unknown");
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                boolean isMainFrame = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && request != null && request.isForMainFrame();
                int code = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && error != null ? error.getErrorCode() : -1;
                Log.d(TAG, "onReceivedError: code=" + code + ", mainFrame=" + isMainFrame);
            }
        });

        // Check network connectivity at startup
        ConnectivityManager connectivityManager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        boolean hasValidatedNetwork = isNetworkAvailable(connectivityManager);

        if (!hasValidatedNetwork) {
            // Show offline screen immediately if no network at startup
            // This covers the WebView before Capacitor's initial load completes
            Log.d(TAG, "Cold-start offline detected");
            showOfflineScreen("cold_start_no_network");
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
                Log.d(TAG, "onAvailable: network available");
                // Check if this network has validated internet
                NetworkCapabilities capabilities = connectivityManager.getNetworkCapabilities(network);
                if (capabilities != null) {
                    boolean hasInternet = capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
                    boolean hasValidated = capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
                    Log.d(TAG, "onAvailable: INTERNET=" + hasInternet + ", VALIDATED=" + hasValidated);

                    if (hasInternet && hasValidated) {
                        triggerRecovery();
                        runOnUiThread(() -> {
                            Log.d(TAG, "onAvailable: validated network present, hiding offline view if visible");
                            hideOfflineScreen();
                        });
                    }
                }
            }

            @Override
            public void onCapabilitiesChanged(Network network, NetworkCapabilities networkCapabilities) {
                Log.d(TAG, "onCapabilitiesChanged");
                boolean hasInternet = networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
                boolean hasValidated = networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
                Log.d(TAG, "onCapabilitiesChanged: INTERNET=" + hasInternet + ", VALIDATED=" + hasValidated);

                if (hasInternet && hasValidated) {
                    triggerRecovery();
                    runOnUiThread(() -> {
                        Log.d(TAG, "onCapabilitiesChanged: validated network present, hiding offline view if visible");
                        hideOfflineScreen();
                    });
                }
            }

            @Override
            public void onLost(Network network) {
                Log.d(TAG, "onLost: network lost");
                // Only show offline screen if we haven't loaded successfully yet
                // Once loaded, let React/Capacitor handle runtime offline
                if (!hasLoadedSuccessfully) {
                    isWaitingForNetwork = true;
                    runOnUiThread(() -> showOfflineScreen("network_lost_before_first_load"));
                }
            }
        };

        connectivityManager.registerNetworkCallback(networkRequest, networkCallback);
        Log.d(TAG, "Network callback registered");
    }

    private void triggerRecovery() {
        Log.d(TAG, "triggerRecovery: isWaitingForNetwork=" + isWaitingForNetwork + ", hasLoadedSuccessfully=" + hasLoadedSuccessfully + ", launchedInOfflineState=" + launchedInOfflineState + ", isRecreating=" + isRecreating);

        if (isWaitingForNetwork && !hasLoadedSuccessfully && launchedInOfflineState && !isRecreating) {
            isWaitingForNetwork = false;
            isRecreating = true;
            Log.d(TAG, "Recreate triggered");
            runOnUiThread(() -> {
                // Recreate activity to perform fresh normal startup
                // This preserves WebView storage, cookies, and auth state
                recreate();
            });
        } else {
            Log.d(TAG, "Recreate skipped: conditions not met");
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

    private void showOfflineScreen(String reason) {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        boolean validated = isNetworkAvailable(cm);
        Log.d(TAG, "showOfflineScreen requested: reason=" + reason + ", hasLoadedSuccessfully=" + hasLoadedSuccessfully + ", validatedNetwork=" + validated);
        if (validated) {
            Log.d(TAG, "Skip showOfflineScreen: validated network present");
            return;
        }
        if (offlineView == null) {
            offlineView = createOfflineView();
        }

        if (offlineView.getParent() == null) {
            // Add offline view to the root layout using generic ViewGroup
            ViewGroup rootLayout = (ViewGroup) webView.getParent();
            if (rootLayout != null) {
                // Set MATCH_PARENT LayoutParams to fill the entire parent
                ViewGroup.LayoutParams params = new ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                );
                rootLayout.addView(offlineView, params);
            }
        }

        webView.setVisibility(View.GONE);
        offlineView.setVisibility(View.VISIBLE);
    }

    private void showOfflineScreen() {
        showOfflineScreen("unspecified");
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
        layout.setPadding(40, 40, 40, 40);

        // ReplyFlow R logo
        ImageView logoView = new ImageView(context);
        logoView.setImageResource(R.drawable.ic_replyflow_logo);
        logoView.setScaleType(ImageView.ScaleType.FIT_XY);
        logoView.setAdjustViewBounds(true);
        LinearLayout.LayoutParams logoLayoutParams = new LinearLayout.LayoutParams(
            400,
            400
        );
        logoLayoutParams.gravity = Gravity.CENTER;
        logoLayoutParams.setMargins(0, 0, 0, 32);
        logoView.setLayoutParams(logoLayoutParams);
        layout.addView(logoView, logoLayoutParams);

        // Offline icon using vector drawable
        ImageView iconView = new ImageView(context);
        iconView.setImageResource(R.drawable.ic_material_wifi_off);
        iconView.setScaleType(ImageView.ScaleType.FIT_XY);
        LinearLayout.LayoutParams iconParams = new LinearLayout.LayoutParams(
            240,
            240
        );
        iconParams.gravity = Gravity.CENTER;
        iconParams.setMargins(0, 0, 0, 36);
        iconView.setLayoutParams(iconParams);
        layout.addView(iconView, iconParams);

        // Main message
        TextView messageText = new TextView(context);
        messageText.setText("You're offline");
        messageText.setTextSize(30);
        messageText.setTextColor(Color.WHITE);
        messageText.setTypeface(null, android.graphics.Typeface.BOLD);
        messageText.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams messageParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        messageParams.setMargins(0, 0, 0, 24);
        layout.addView(messageText, messageParams);

        // Subtitle - updated to reflect automatic reconnection
        TextView subtitleText = new TextView(context);
        subtitleText.setText("Check your internet connection.\nReplyFlow will reconnect automatically.");
        subtitleText.setTextSize(18);
        subtitleText.setTextColor(Color.parseColor("#94a3b8")); // slate-400
        subtitleText.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams subtitleParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        subtitleParams.setMargins(0, 0, 0, 32);
        layout.addView(subtitleText, subtitleParams);

        // Supporting text
        TextView supportingText = new TextView(context);
        supportingText.setText("ReplyFlow requires an internet connection to load your latest customers, messages, jobs, and schedule.");
        supportingText.setTextSize(15);
        supportingText.setTextColor(Color.parseColor("#64748b")); // slate-500
        supportingText.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams supportingParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        supportingParams.setMargins(0, 0, 0, 0);
        layout.addView(supportingText, supportingParams);

        return layout;
    }

    // (Diagnostics removed)
}
