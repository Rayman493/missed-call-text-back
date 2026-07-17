package com.replyflowhq.app;

import android.content.Context;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;

public class MainActivity extends BridgeActivity {
    private View offlineView;
    private WebView webView;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Get the Capacitor WebView
        webView = getBridge().getWebView();

        // Set custom WebViewClient to handle load errors
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                // Show offline screen on load errors
                showOfflineScreen();
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                // Hide offline screen when page loads successfully
                hideOfflineScreen();
            }
        });
    }

    private void showOfflineScreen() {
        if (offlineView == null) {
            offlineView = createOfflineView();
        }
        
        if (offlineView.getParent() == null) {
            // Add offline view to the root layout
            LinearLayout rootLayout = (LinearLayout) webView.getParent();
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
            // Reload the WebView
            webView.reload();
        });
        layout.addView(retryButton, buttonParams);

        return layout;
    }
}
