package com.replyflowhq.terminal;

import androidx.annotation.NonNull;
import android.util.Log;

import java.util.UUID;
import java.util.Iterator;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import android.content.pm.PackageManager;
import android.os.Build;
import android.nfc.NfcAdapter;

// Stripe Terminal Android SDK (added as Gradle dependency)
import com.stripe.stripeterminal.Terminal;
import com.stripe.stripeterminal.log.LogLevel;
import com.stripe.stripeterminal.external.callable.ConnectionTokenProvider;
import com.stripe.stripeterminal.external.callable.ConnectionTokenCallback;
import com.stripe.stripeterminal.external.callable.TerminalListener;
import com.stripe.stripeterminal.external.models.ConnectionTokenException;
import com.stripe.stripeterminal.external.models.Reader;
import com.stripe.stripeterminal.external.callable.DiscoveryListener;
import com.stripe.stripeterminal.external.models.DiscoveryConfiguration;
import com.stripe.stripeterminal.external.models.TerminalException;
import com.stripe.stripeterminal.external.models.DeviceType;
import com.stripe.stripeterminal.external.models.DiscoveryConfiguration.TapToPayDiscoveryConfiguration;
import com.stripe.stripeterminal.external.models.ConnectionConfiguration.TapToPayConnectionConfiguration;
import com.stripe.stripeterminal.external.models.PaymentIntent;
import com.stripe.stripeterminal.external.models.PaymentIntentStatus;
import com.stripe.stripeterminal.external.models.LocaleConfig;
import com.stripe.stripeterminal.external.callable.PaymentIntentCallback;
import java.util.Locale;

@CapacitorPlugin(name = "ReplyflowStripeTerminal")
public class ReplyflowStripeTerminalPlugin extends Plugin {
  private static final String TAG = "ReplyflowStripeTerminal";
  private static final String BUILD_MARKER = "TAP_TO_PAY_DEEP_AUDIT_2026_07_22_V4";

  // Initialization state tracking
  private enum InitState {
    NOT_INITIALIZED,
    INITIALIZING,
    INITIALIZED,
    FAILED
  }

  private void setKeepScreenOn(final boolean enabled) {
    try {
      getActivity().runOnUiThread(() -> {
        android.view.Window window = getActivity().getWindow();
        if (window != null) {
          if (enabled) {
            window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            Log.d(TAG, "[APP_LIFECYCLE] keep_screen_on_enabled");
          } else {
            window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            Log.d(TAG, "[APP_LIFECYCLE] keep_screen_on_disabled");
          }
        }
      });
    } catch (Exception e) {
      Log.w(TAG, "[APP_LIFECYCLE] keep_screen_on_toggle_failed " + e.getMessage());
    }
  }

  private volatile InitState initState = InitState.NOT_INITIALIZED;

  // Native operation state machine
  private enum OperationState {
    UNINITIALIZED,
    IDLE,
    INITIALIZING,
    DISCOVERING,
    CONNECTING,
    CONNECTED,
    RETRIEVING_PAYMENT_INTENT,
    COLLECTING_PAYMENT_METHOD,
    CONFIRMING_PAYMENT_INTENT,
    CANCELING,
    SUCCEEDED,
    FAILED
  }

  private volatile OperationState operationState = OperationState.UNINITIALIZED;
  private final Object initLock = new Object();
  // Correlation tracking
  private volatile String currentCorrelationId = null;
  // Native connect in-flight guard
  private final Object connectGuard = new Object();
  private volatile boolean connectInFlightNative = false;
  private volatile String activeConnectOpId = null;

  @Override
  public void load() {
    super.load();
    Log.d(TAG, "[PLUGIN] ReplyflowStripeTerminalPlugin.load() executed - plugin loaded successfully");
    Log.d(TAG, "[PLUGIN] Build marker: " + BUILD_MARKER);
  }

  // Emit sanitized diagnostics to JS so the app can persist in-app
  private void emitDiag(String name, String phase, String correlationId, JSObject more) {
    try {
      JSObject payload = new JSObject();
      payload.put("name", name);
      if (phase != null) payload.put("phase", phase);
      payload.put("timestamp", System.currentTimeMillis());
      if (correlationId != null) payload.put("attemptId", correlationId);
      if (more != null) {
        Iterator<String> keys = more.keys();
        while (keys.hasNext()) {
          String k = keys.next();
          payload.put(k, more.get(k));
        }
      }
      notifyListeners("tpDiagnostics", payload);
    } catch (Exception ignored) {}
  }

  @Override
  protected void handleOnStart() {
    super.handleOnStart();
    Log.d(TAG, "[APP_LIFECYCLE] onStart collecting=" + collectingPayment + " discovering=" + discovering + " status=" + status + " operation_state=" + operationState);
  }

  @Override
  protected void handleOnResume() {
    super.handleOnResume();
    Log.d(TAG, "[APP_LIFECYCLE] onResume collecting=" + collectingPayment + " discovering=" + discovering + " status=" + status + " operation_state=" + operationState);
  }

  @Override
  protected void handleOnPause() {
    Log.d(TAG, "[APP_LIFECYCLE] onPause collecting=" + collectingPayment + " discovering=" + discovering + " status=" + status + " operation_state=" + operationState);
    super.handleOnPause();
  }

  @Override
  protected void handleOnStop() {
    Log.d(TAG, "[APP_LIFECYCLE] onStop collecting=" + collectingPayment + " discovering=" + discovering + " status=" + status + " operation_state=" + operationState);
    super.handleOnStop();
  }

  @Override
  public void handleOnDestroy() {
    Log.d(TAG, "[APP_LIFECYCLE] onDestroy collecting=" + collectingPayment + " discovering=" + discovering + " status=" + status + " operation_state=" + operationState);
    super.handleOnDestroy();
  }

  private String status = "not_initialized";
  private volatile boolean initialized = false;
  
  // Discovery and connection state
  private com.stripe.stripeterminal.external.callable.Cancelable discoveryCancelable = null;
  private Reader connectedReader = null;
  private volatile boolean discovering = false;
  
  // Payment collection state
  private com.stripe.stripeterminal.external.callable.Cancelable paymentCancelable = null;
  private volatile boolean collectingPayment = false;

  // Request-scoped token request tracking to handle concurrent requests safely
  private static class PendingTokenRequest {
    final String requestId;
    final java.util.List<ConnectionTokenCallback> callbacks;
    final AtomicBoolean completed;
    Thread timeoutThread;

    PendingTokenRequest(String requestId) {
      this.requestId = requestId;
      this.callbacks = new java.util.ArrayList<>();
      this.completed = new AtomicBoolean(false);
    }

    void addCallback(ConnectionTokenCallback cb) {
      synchronized (callbacks) {
        callbacks.add(cb);
      }
    }
  }

  private final ConcurrentHashMap<String, PendingTokenRequest> pendingTokenRequests = new ConcurrentHashMap<>();

  @PluginMethod
  public void initialize(PluginCall call) {
    // Capture optional diagnosticAttemptId (used only as fallback elsewhere)
    String diagId = call.getString("diagnosticAttemptId");
    currentCorrelationId = diagId != null && !diagId.isEmpty() ? diagId : currentCorrelationId;
    Log.d(TAG, "[STRIPE_TERMINAL_INIT] Starting initialization");
    Log.d(TAG, "[TAP_SESSION_TRACE] stage=terminal_init_start ts=" + System.currentTimeMillis());
    final String initCorrelationId = call.getString("diagnosticAttemptId");
    emitDiag("initialize_called", "initialize", initCorrelationId, null);
    Log.d(TAG, "[STRIPE_TERMINAL_INIT] Current init state: " + initState);
    Log.d(TAG, "[STRIPE_TERMINAL_INIT] Android SDK: " + Build.VERSION.SDK_INT);
    Log.d(TAG, "[STRIPE_TERMINAL_INIT] NFC available: " + getContext().getPackageManager().hasSystemFeature(PackageManager.FEATURE_NFC));

    // Get device locale for diagnostics
    Locale deviceLocale = Locale.getDefault();
    String localeIdentifier = deviceLocale.toString(); // e.g., "en_US"
    Log.d(TAG, "[STRIPE_TERMINAL_INIT] Device locale: " + localeIdentifier);

    synchronized (initLock) {
      if (initState == InitState.INITIALIZED) {
        Log.d(TAG, "[STRIPE_TERMINAL_INIT] Already initialized, returning success");
        status = "ready";
        JSObject ret = new JSObject();
        ret.put("status", status);
        call.resolve(ret);
        return;
      }

      if (initState == InitState.INITIALIZING) {
        Log.d(TAG, "[STRIPE_TERMINAL_INIT] Already initializing, waiting for completion");
        // For simplicity, reject concurrent initialization attempts
        JSObject err = new JSObject();
        err.put("message", "Initialization already in progress");
        call.reject("terminal-init-in-progress", err);
        return;
      }

      initState = InitState.INITIALIZING;
    }

    try {
      Log.d(TAG, "[STRIPE_TERMINAL_INIT] Calling Terminal.init()...");
      // The SDK 5.7.0 documentation mentions LocaleConfig but the actual API differs from docs
      // Try using the deprecated overload without LocaleConfig since the new API is not available
      Log.d(TAG, "[STRIPE_TERMINAL_INIT] Using deprecated Terminal.init() overload (without LocaleConfig)");
      Log.d(TAG, "[STRIPE_TERMINAL_INIT] Device locale: " + localeIdentifier);

      Terminal.init(
        getContext().getApplicationContext(),
        LogLevel.VERBOSE,
        new JsBridgedConnectionTokenProvider(),
        new BasicTerminalListener(),
        null // offlineListener
      );
      initialized = true;
      initState = InitState.INITIALIZED;
      Log.d(TAG, "[STRIPE_TERMINAL_INIT] Terminal.init() succeeded");
      Log.d(TAG, "[TAP_SESSION_TRACE] stage=terminal_init_complete ts=" + System.currentTimeMillis());
      emitDiag("initialize_completed", "initialize", initCorrelationId, null);
    } catch (Exception e) {
      Log.e(TAG, "[STRIPE_TERMINAL_INIT] Terminal.init() failed", e);
      Log.e(TAG, "[STRIPE_TERMINAL_INIT] Exception class: " + e.getClass().getName());
      Log.e(TAG, "[STRIPE_TERMINAL_INIT] Exception message: " + e.getMessage());
      if (e.getCause() != null) {
        Log.e(TAG, "[STRIPE_TERMINAL_INIT] Exception cause: " + e.getCause().getClass().getName() + ": " + e.getCause().getMessage());
      }

      JSObject more = new JSObject();
      more.put("code", e.getClass().getSimpleName());
      more.put("message", e.getMessage());
      emitDiag("initialize_failed", "initialize", initCorrelationId, more);

      synchronized (initLock) {
        initState = InitState.FAILED;
      }

      JSObject err = new JSObject();
      err.put("message", e.getMessage());
      err.put("nativeCode", e.getClass().getSimpleName());
      err.put("nativeMessage", e.getMessage());
      err.put("exceptionType", e.getClass().getName());
      call.reject("terminal-init-failed", err);
      return;
    }

    status = "ready";
    JSObject ret = new JSObject();
    ret.put("status", status);
    call.resolve(ret);
  }

  @PluginMethod
  public void ping(PluginCall call) {
    Log.d(TAG, "[PLUGIN] ping() called - JS→native communication working");
    JSObject ret = new JSObject();
    ret.put("available", true);
    ret.put("platform", "android");
    ret.put("buildMarker", BUILD_MARKER);
    call.resolve(ret);
  }

  @PluginMethod
  public void isSupported(PluginCall call) {
    Log.d(TAG, "[DEVICE_COMPAT] Checking device compatibility");
    Log.d(TAG, "[DEVICE_COMPAT] Android SDK: " + Build.VERSION.SDK_INT);
    Log.d(TAG, "[DEVICE_COMPAT] Android release: " + Build.VERSION.RELEASE);
    Log.d(TAG, "[DEVICE_COMPAT] Manufacturer: " + Build.MANUFACTURER);
    Log.d(TAG, "[DEVICE_COMPAT] Model: " + Build.MODEL);
    Log.d(TAG, "[DEVICE_COMPAT] Device: " + Build.DEVICE);

    boolean osOk = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU; // Android 13+
    boolean hasNfc = getContext().getPackageManager().hasSystemFeature(PackageManager.FEATURE_NFC);

    Log.d(TAG, "[DEVICE_COMPAT] OS check (>= Android 13): " + osOk);
    Log.d(TAG, "[DEVICE_COMPAT] NFC hardware available: " + hasNfc);
    Log.d(TAG, "[DEVICE_COMPAT] Terminal initialized: " + initialized);

    // Basic device checks - Stripe SDK will provide detailed validation during discovery
    boolean tapToPaySupported = osOk && hasNfc;
    String unsupportedReason = null;

    if (!osOk) {
      unsupportedReason = "unsupported_os";
      Log.d(TAG, "[DEVICE_COMPAT] Unsupported: OS version too low");
    } else if (!hasNfc) {
      unsupportedReason = "nfc_unavailable";
      Log.d(TAG, "[DEVICE_COMPAT] Unsupported: NFC hardware not available");
    } else if (!initialized) {
      unsupportedReason = "not_initialized";
      Log.d(TAG, "[DEVICE_COMPAT] Not initialized but device supports Tap to Pay");
    } else {
      Log.d(TAG, "[DEVICE_COMPAT] Device supports Tap to Pay");
    }

    JSObject ret = new JSObject();
    ret.put("supported", tapToPaySupported);
    ret.put("platform", "android");
    ret.put("osOk", osOk);
    ret.put("nfc", hasNfc);
    ret.put("unsupportedReason", unsupportedReason);
    ret.put("androidSdk", Build.VERSION.SDK_INT);
    ret.put("androidRelease", Build.VERSION.RELEASE);
    ret.put("manufacturer", Build.MANUFACTURER);
    ret.put("model", Build.MODEL);
    call.resolve(ret);
  }

  @PluginMethod
  public void requestConnectionToken(PluginCall call) {
    // Deprecated: this method is kept for compatibility but not used in new flow
    call.resolve();
  }

  @PluginMethod
  public void supplyConnectionToken(PluginCall call) {
    String requestId = call.getString("requestId");
    String secret = call.getString("secret");
    Log.d(TAG, "[TOKEN_TRACE] stage=native_supply_received requestId=" + requestId + " token_present=" + (secret != null && !secret.isEmpty()) + " token_length=" + (secret != null ? secret.length() : 0));

    if (requestId == null || requestId.isEmpty() || secret == null || secret.isEmpty()) {
      Log.w(TAG, "[TOKEN_TRACE] stage=native_supply_rejected requestId=" + requestId + " reason=invalid_params");
      call.reject("invalid-params");
      return;
    }

    PendingTokenRequest request = pendingTokenRequests.get(requestId);
    if (request == null) {
      // Stale or mismatched requestId - ignore
      Log.w(TAG, "[TOKEN_TRACE] stage=native_request_not_found requestId=" + requestId + " pendingCount=" + pendingTokenRequests.size());
      call.resolve();
      return;
    }

    Log.d(TAG, "[TOKEN_TRACE] stage=native_request_found requestId=" + requestId + " completed=" + request.completed.get());

    // Atomically mark as completed and invoke callback
    if (request.completed.compareAndSet(false, true)) {
      Log.d(TAG, "[TOKEN_TRACE] stage=native_completion_claimed requestId=" + requestId);
      // Cancel timeout thread
      if (request.timeoutThread != null) {
        request.timeoutThread.interrupt();
        Log.d(TAG, "[TOKEN_TRACE] stage=native_timeout_interrupted requestId=" + requestId);
      }
      // Remove from pending map
      pendingTokenRequests.remove(requestId);
      // Invoke success callback
      synchronized (request.callbacks) {
        for (ConnectionTokenCallback cb : request.callbacks) {
          try { cb.onSuccess(secret); } catch (Exception ignore) {}
        }
      }
      Log.d(TAG, "[TOKEN_TRACE] stage=native_callback_success requestId=" + requestId);
    } else {
      // Already completed (timeout or error already fired)
      Log.w(TAG, "[TOKEN_TRACE] stage=native_already_completed requestId=" + requestId + " reason=timeout_already_fired");
    }

    call.resolve();
  }

  @PluginMethod
  public void supplyConnectionTokenError(PluginCall call) {
    String requestId = call.getString("requestId");
    String message = call.getString("message");
    if (requestId == null || requestId.isEmpty()) {
      call.reject("invalid-params");
      return;
    }

    PendingTokenRequest request = pendingTokenRequests.get(requestId);
    if (request == null) {
      // Stale or mismatched requestId - ignore
      Log.w(TAG, "[TOKEN] supplyConnectionTokenError: requestId not found (stale): " + requestId);
      call.resolve();
      return;
    }

    // Atomically mark as completed and invoke callback
    if (request.completed.compareAndSet(false, true)) {
      // Cancel timeout thread
      if (request.timeoutThread != null) {
        request.timeoutThread.interrupt();
      }
      // Remove from pending map
      pendingTokenRequests.remove(requestId);
      // Invoke failure callback
      synchronized (request.callbacks) {
        for (ConnectionTokenCallback cb : request.callbacks) {
          try { cb.onFailure(new ConnectionTokenException(message)); } catch (Exception ignore) {}
        }
      }
      Log.d(TAG, "[TOKEN] supplyConnectionTokenError: failure for requestId: " + requestId);
    } else {
      // Already completed (timeout already fired)
      Log.w(TAG, "[TOKEN] supplyConnectionTokenError: request already completed, ignoring: " + requestId);
    }

    call.resolve();
  }

  @PluginMethod
  public void connectTapToPay(PluginCall call) {
    // Capture optional diagnosticAttemptId for this operation scope
    final String connectCorrelationId = call.getString("diagnosticAttemptId");
    if (!initialized) {
      call.reject("not-initialized");
      return;
    }

    // Prevent duplicate discovery
    if (discovering) {
      call.reject("discovery-already-active");
      return;
    }

    boolean requestedSimulated = call.getBoolean("simulated", false);
    String locationId = call.getString("locationId");

    // Location ID is required for Tap to Pay connection
    if (locationId == null || locationId.isEmpty()) {
      call.reject("location-id-required");
      return;
    }

    // Respect explicit simulation flag even in debug builds to allow real-device testing when requested
    boolean isDebuggable = (getContext().getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    boolean effectiveSimulated = requestedSimulated;

    Log.d(TAG, "[TAP_TO_PAY_MODE] app_debuggable=" + isDebuggable + " requested_simulated=" + requestedSimulated + " effective_simulated=" + effectiveSimulated);

    if (isDebuggable && !requestedSimulated) {
      Log.w(TAG, "[TAP_TO_PAY_MODE] Debug build proceeding with real Tap to Pay as explicitly requested");
    }

    // Reconcile plugin state with Stripe SDK state
    Reader stripeConnectedReader = Terminal.getInstance().getConnectedReader();
    if (stripeConnectedReader != null) {
      // Reader is already connected - reuse it
      Log.d(TAG, "[TAP_TO_PAY] Reader already connected, reusing: " + stripeConnectedReader.getId());
      connectedReader = stripeConnectedReader;
      status = "connected";
      notifyListeners("statusChanged", new JSObject().put("status", status));

      JSObject readerInfo = new JSObject();
      readerInfo.put("connected", true);
      readerInfo.put("readerId", stripeConnectedReader.getId());
      readerInfo.put("deviceType", stripeConnectedReader.getDeviceType().toString());
      readerInfo.put("simulated", effectiveSimulated);

      notifyListeners("readerConnected", readerInfo);

      // Minimal trace for reuse before discovery
      Log.d(TAG, "[TAP_SESSION_TRACE] stage=pre_discovery_reader_reused reader_id=" + stripeConnectedReader.getId() + " connection_status=" + status);
      JSObject diag1 = new JSObject();
      diag1.put("readerId", stripeConnectedReader.getId());
      diag1.put("connectionStatus", status);
      emitDiag("pre_discovery_reader_reused", "connect_reader", connectCorrelationId, diag1);

      JSObject ret = new JSObject();
      ret.put("status", status);
      call.resolve(ret);
      return;
    }

    discovering = true;
    status = "discovering";
    notifyListeners("statusChanged", new JSObject().put("status", status));
    Log.d(TAG, "[TAP_SESSION_TRACE] stage=discover_start ts=" + System.currentTimeMillis());
    emitDiag("discover_readers_started", "discover", connectCorrelationId, null);

    // Create Tap to Pay discovery configuration
    DiscoveryConfiguration cfg = new DiscoveryConfiguration.TapToPayDiscoveryConfiguration(
      effectiveSimulated
    );

    // PRE-DISCOVERY READER CHECK: Final check immediately before discovery
    // This catches race conditions where a reader connects between the initial check and discovery
    Reader preDiscoveryReader = Terminal.getInstance().getConnectedReader();
    Log.d(TAG, "[TAP_SESSION_TRACE] stage=pre_discovery_reader_check connected=" + (preDiscoveryReader != null));
    if (preDiscoveryReader != null) {
      // Reader is now connected - reuse it instead of discovering
      Log.d(TAG, "[TAP_SESSION_TRACE] reader_connected_before_discovery reusing=" + preDiscoveryReader.getId());
      discovering = false;
      connectedReader = preDiscoveryReader;
      status = "connected";
      notifyListeners("statusChanged", new JSObject().put("status", status));

      JSObject readerInfo = new JSObject();
      readerInfo.put("connected", true);
      readerInfo.put("readerId", preDiscoveryReader.getId());
      readerInfo.put("deviceType", preDiscoveryReader.getDeviceType().toString());
      readerInfo.put("simulated", effectiveSimulated);

      notifyListeners("readerConnected", readerInfo);

      // Minimal trace for reuse before discovery connect
      Log.d(TAG, "[TAP_SESSION_TRACE] stage=pre_discovery_reader_reused reader_id=" + preDiscoveryReader.getId() + " connection_status=" + status);
      JSObject diag2 = new JSObject();
      diag2.put("readerId", preDiscoveryReader.getId());
      diag2.put("connectionStatus", status);
      emitDiag("pre_discovery_reader_reused", "connect_reader", connectCorrelationId, diag2);

      JSObject ret = new JSObject();
      ret.put("status", status);
      call.resolve(ret);
      return;
    }

    discoveryCancelable = Terminal.getInstance().discoverReaders(
      cfg,
      new DiscoveryListener() {
        @Override
        public void onUpdateDiscoveredReaders(@NonNull java.util.List<Reader> readers) {
          Log.d(TAG, "[TAP_SESSION_TRACE] stage=reader_discovered count=" + readers.size() + " ts=" + System.currentTimeMillis());
          if (!readers.isEmpty()) {
            // For Tap to Pay, we expect at most one local reader
            // Auto-connect to the first discovered reader
            Reader reader = readers.get(0);
            // Claim connect once to avoid duplicate native connects on rapid updates
            boolean claimed = false;
            synchronized (connectGuard) {
              if (!connectInFlightNative) {
                connectInFlightNative = true;
                claimed = true;
              }
            }
            if (!claimed) {
              JSObject s = new JSObject();
              s.put("reason", "connect_inflight_native");
              s.put("detail", "discovery_update_ignored");
              emitDiag("stale_discovery_update_ignored", "connect_reader", connectCorrelationId, s);
              return;
            }
            // Cancel discovery before attempting to connect to avoid races
            if (discoveryCancelable != null) {
              Log.d(TAG, "[TAP_SESSION_TRACE] stage=discover_cancel_before_connect ts=" + System.currentTimeMillis());
              discoveryCancelable.cancel(new com.stripe.stripeterminal.external.callable.Callback() {
                @Override
                public void onSuccess() {
                  discovering = false;
                  connectToReader(reader, effectiveSimulated, locationId, connectCorrelationId);
                }

                @Override
                public void onFailure(@NonNull TerminalException e) {
                  Log.w(TAG, "[TAP_SESSION_TRACE] stage=discover_cancel_failed code=" + e.getErrorCode());
                  // Proceed to connect anyway; SDK may still permit connect
                  discovering = false;
                  connectToReader(reader, effectiveSimulated, locationId, connectCorrelationId);
                }
              });
            } else {
              connectToReader(reader, effectiveSimulated, locationId, connectCorrelationId);
            }
          }
        }
      },
      new com.stripe.stripeterminal.external.callable.Callback() {
        @Override
        public void onSuccess() {
          discovering = false;
          // If we didn't connect during discovery, mark as ready
          if (connectedReader == null) {
            status = "ready";
            notifyListeners("statusChanged", new JSObject().put("status", status));
          }
          emitDiag("discover_readers_completed", "discover", connectCorrelationId, null);
        }

        @Override
        public void onFailure(@NonNull TerminalException e) {
          discovering = false;

          // Handle ALREADY_CONNECTED_TO_READER race defensively
          // If discovery failed because a reader connected during the race, treat it as success
          if (e.getErrorCode() == com.stripe.stripeterminal.external.models.TerminalErrorCode.ALREADY_CONNECTED_TO_READER) {
            Log.d(TAG, "[TAP_SESSION_TRACE] discovery_failed_already_connected checking_reader");
            Reader readerAfterError = Terminal.getInstance().getConnectedReader();
            if (readerAfterError != null) {
              // Reader now exists - race recovery: treat as success
              Log.d(TAG, "[TAP_SESSION_TRACE] race_recovery reader_connected=" + readerAfterError.getId());
              connectedReader = readerAfterError;
              status = "connected";
              notifyListeners("statusChanged", new JSObject().put("status", status));

              JSObject readerInfo = new JSObject();
              readerInfo.put("connected", true);
              readerInfo.put("readerId", readerAfterError.getId());
              readerInfo.put("deviceType", readerAfterError.getDeviceType().toString());
              readerInfo.put("simulated", effectiveSimulated);

              notifyListeners("readerConnected", readerInfo);

              JSObject ret = new JSObject();
              ret.put("status", status);
              call.resolve(ret);
              return;
            }
            // No reader after error - propagate the error
            Log.d(TAG, "[TAP_SESSION_TRACE] race_recovery_no_reader propagating_error");
          }

          JSObject err = createStructuredError("discover_readers", e);
          err.put("deviceState", captureDeviceState());
          notifyListeners("error", err);
          status = "error";
          notifyListeners("statusChanged", new JSObject().put("status", status));
          JSObject d = new JSObject();
          if (e.getErrorCode() != null) d.put("code", e.getErrorCode().toString());
          d.put("message", e.getMessage());
          emitDiag("discover_readers_failed", "discover", connectCorrelationId, d);
        }
      }
    );

    JSObject ret = new JSObject();
    ret.put("status", status);
    call.resolve(ret);
  }
  
  private void connectToReader(Reader reader, boolean simulated, String locationId, final String correlationId) {
    // Generate a native operationId immediately before invoking the Stripe SDK
    final String operationId = UUID.randomUUID().toString();
    activeConnectOpId = operationId;
    JSObject cstart = new JSObject();
    cstart.put("readerId", reader.getId());
    cstart.put("operationId", operationId);
    emitDiag("connect_reader_started", "connect_reader", correlationId, cstart);
    // Defensive check: if a reader became connected during discovery, reuse it
    Reader existing = Terminal.getInstance().getConnectedReader();
    if (existing != null) {
      Log.d(TAG, "[TAP_SESSION_TRACE] stage=pre_connect_reader_reused reader_id=" + existing.getId() + " connection_status=" + status);
      connectedReader = existing;
      status = "connected";
      notifyListeners("statusChanged", new JSObject().put("status", status));

      JSObject readerInfo = new JSObject();
      readerInfo.put("connected", true);
      readerInfo.put("readerId", existing.getId());
      readerInfo.put("deviceType", existing.getDeviceType().toString());
      readerInfo.put("simulated", simulated);

      notifyListeners("readerConnected", readerInfo);
      // Release native in-flight guard since no SDK call is needed
      synchronized (connectGuard) { connectInFlightNative = false; activeConnectOpId = null; }
      return;
    }

    status = "connecting";
    notifyListeners("statusChanged", new JSObject().put("status", status));
    Log.d(TAG, "[TAP_SESSION_TRACE] stage=connect_start reader_id=" + reader.getId() + " ts=" + System.currentTimeMillis());
    
    // Create Tap to Pay connection configuration with location ID
    TapToPayConnectionConfiguration connectionConfig = new TapToPayConnectionConfiguration(
      locationId,
      true, // autoReconnectOnUnexpectedDisconnect
      null // tapToPayReaderListener (can be null for basic functionality)
    );
    
    Terminal.getInstance().connectReader(
      reader,
      connectionConfig,
      new com.stripe.stripeterminal.external.callable.ReaderCallback() {
        @Override
        public void onSuccess(Reader connectedReader) {
          // Stale-callback guard: only the owner opId may complete
          if (activeConnectOpId == null || !activeConnectOpId.equals(operationId)) {
            JSObject stale = new JSObject();
            stale.put("operationId", operationId);
            stale.put("activeOperationId", activeConnectOpId);
            stale.put("eventType", "onSuccess");
            emitDiag("stale_connect_callback_ignored", "connect_reader", correlationId, stale);
            return;
          }
          ReplyflowStripeTerminalPlugin.this.connectedReader = connectedReader;
          status = "connected";
          Log.d(TAG, "[TAP_SESSION_TRACE] stage=reader_connected reader_id=" + connectedReader.getId() + " ts=" + System.currentTimeMillis());

          JSObject readerInfo = new JSObject();
          readerInfo.put("connected", true);
          readerInfo.put("readerId", connectedReader.getId());
          readerInfo.put("deviceType", connectedReader.getDeviceType().toString());
          readerInfo.put("simulated", simulated);

          notifyListeners("statusChanged", new JSObject().put("status", status));
          notifyListeners("readerConnected", readerInfo);
          JSObject done = new JSObject();
          done.put("readerId", connectedReader.getId());
          done.put("connectionStatus", status);
          done.put("operationId", operationId);
          emitDiag("connect_reader_completed", "connect_reader", correlationId, done);
          synchronized (connectGuard) { connectInFlightNative = false; activeConnectOpId = null; }
        }

        @Override
        public void onFailure(@NonNull TerminalException e) {
          // Stale-callback guard: only the owner opId may fail the operation
          if (activeConnectOpId == null || !activeConnectOpId.equals(operationId)) {
            JSObject stale = new JSObject();
            stale.put("operationId", operationId);
            stale.put("activeOperationId", activeConnectOpId);
            stale.put("eventType", "onFailure");
            stale.put("code", e.getErrorCode() != null ? e.getErrorCode().toString() : null);
            stale.put("message", e.getMessage());
            emitDiag("stale_connect_callback_ignored", "connect_reader", correlationId, stale);
            return;
          }
          JSObject err = createStructuredError("connect_reader", e);
          err.put("deviceState", captureDeviceState());
          notifyListeners("error", err);
          // Treat ALREADY_CONNECTED_TO_READER as benign if reader is now connected
          if (e.getErrorCode() == com.stripe.stripeterminal.external.models.TerminalErrorCode.ALREADY_CONNECTED_TO_READER) {
            Reader r = Terminal.getInstance().getConnectedReader();
            if (r != null) {
              JSObject info = new JSObject();
              info.put("readerId", r.getId());
              info.put("operationId", operationId);
              emitDiag("connect_already_connected_treated_success", "connect_reader", correlationId, info);
              // Preserve connected status and do not overwrite with error
              synchronized (connectGuard) { connectInFlightNative = false; activeConnectOpId = null; }
              return;
            }
          }
          status = "error";
          notifyListeners("statusChanged", new JSObject().put("status", status));
          JSObject d = new JSObject();
          if (e.getErrorCode() != null) d.put("code", e.getErrorCode().toString());
          d.put("message", e.getMessage());
          d.put("operationId", operationId);
          emitDiag("connect_reader_failed", "connect_reader", correlationId, d);
          synchronized (connectGuard) { connectInFlightNative = false; activeConnectOpId = null; }
        }
      }
    );
  }
  
  private String mapTerminalErrorCode(com.stripe.stripeterminal.external.models.TerminalErrorCode errorCode) {
    if (errorCode == null) {
      return "unknown";
    }

    // Map Stripe SDK error codes to stable app-level codes
    switch (errorCode) {
      case UNSUPPORTED_SDK:
        return "unsupported_os";
      case TAP_TO_PAY_UNSUPPORTED_ANDROID_VERSION:
        return "unsupported_os";
      case TAP_TO_PAY_UNSUPPORTED_DEVICE:
        return "tap_to_pay_unavailable";
      case TAP_TO_PAY_NFC_DISABLED:
        return "nfc_unavailable";
      case BLUETOOTH_LOW_ENERGY_UNSUPPORTED:
        return "bluetooth_unavailable";
      case BLUETOOTH_PERMISSION_DENIED:
        return "bluetooth_permission_required";
      case LOCATION_SERVICES_DISABLED:
        return "location_services_disabled";
      case TAP_TO_PAY_INSECURE_ENVIRONMENT:
        return "device_not_secure";
      case TAP_TO_PAY_DEVICE_TAMPERED:
        return "device_not_secure";
      case TAP_TO_PAY_DEBUG_NOT_SUPPORTED:
        return "debug_build_not_supported";
      case STRIPE_API_CONNECTION_ERROR:
        return "network_error";
      default:
        return errorCode.toString();
    }
  }

  // Create structured error payload for diagnostics
  private JSObject createStructuredError(String stage, com.stripe.stripeterminal.external.models.TerminalException e) {
    JSObject err = new JSObject();
    err.put("code", mapTerminalErrorCode(e.getErrorCode()));
    err.put("message", e.getMessage());
    err.put("stage", stage);

    // Include native error details for diagnostics
    if (e.getErrorCode() != null) {
      err.put("nativeCode", e.getErrorCode().toString());
    }
    if (e.getLocalizedMessage() != null && !e.getLocalizedMessage().equals(e.getMessage())) {
      err.put("localizedMessage", e.getLocalizedMessage());
    }
    err.put("timestamp", System.currentTimeMillis());

    return err;
  }

  // Capture device state snapshot for diagnostics
  private JSObject captureDeviceState() {
    JSObject state = new JSObject();
    state.put("buildMarker", BUILD_MARKER);
    state.put("isDebuggable", (getContext().getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0);
    state.put("androidSdk", Build.VERSION.SDK_INT);
    state.put("manufacturer", Build.MANUFACTURER);
    state.put("model", Build.MODEL);
    state.put("nfcAvailable", getContext().getPackageManager().hasSystemFeature(PackageManager.FEATURE_NFC));
    state.put("terminalInitialized", initialized);
    state.put("connectionStatus", status);
    state.put("readerConnected", connectedReader != null);
    state.put("operationState", operationState.toString());

    // Check NFC enabled state
    NfcAdapter nfcAdapter = NfcAdapter.getDefaultAdapter(getContext());
    state.put("nfcEnabled", nfcAdapter != null && nfcAdapter.isEnabled());

    return state;
  }

  // Transition operation state with logging
  private void setOperationState(OperationState newState, String reason) {
    Log.d(TAG, "[OPERATION_STATE] " + operationState + " -> " + newState + " reason=" + reason);
    operationState = newState;
  }

  @PluginMethod
  public void createTerminalPayment(PluginCall call) {
    // This is a no-op on Android - the PaymentIntent is created server-side
    // The JS layer calls the backend endpoint directly
    call.reject("createTerminalPayment should be called from JS layer via backend API");
  }

  @PluginMethod
  public void collectPayment(PluginCall call) {
    // Capture attempt correlation id for this operation
    final String collectCorrelationId = call.getString("diagnosticAttemptId");
    Log.d(TAG, "[PAYMENT_TRACE] stage=payment_operation_start reader_connected=" + (connectedReader != null) + " connection_status=" + status + " operation_state=" + operationState);
    Log.d(TAG, "[TAP_SESSION_TRACE] stage=payment_start ts=" + System.currentTimeMillis());
    emitDiag("collect_payment_called", "collect_payment", collectCorrelationId, null);

    if (!initialized) {
      Log.d(TAG, "[PAYMENT_TRACE] stage=payment_operation_failure reason=not_initialized");
      setOperationState(OperationState.FAILED, "not_initialized");
      call.reject("not-initialized");
      return;
    }

    if (connectedReader == null) {
      Log.d(TAG, "[PAYMENT_TRACE] stage=payment_operation_failure reason=no_reader_connected");
      setOperationState(OperationState.FAILED, "no_reader_connected");
      call.reject("no-reader-connected");
      return;
    }

    // Prevent duplicate payment collection
    if (collectingPayment) {
      Log.d(TAG, "[PAYMENT_TRACE] stage=payment_operation_failure reason=payment_already_in_progress");
      call.reject("payment-already-in-progress");
      return;
    }

    String clientSecret = call.getString("clientSecret");
    String terminalAttemptId = call.getString("terminalAttemptId");

    Log.d(TAG, "[TAP_ATTEMPT] attempt_id=" + terminalAttemptId + " stage=native_collect_payment_received client_secret_present=" + (clientSecret != null) + " client_secret_length=" + (clientSecret != null ? clientSecret.length() : 0));

    if (clientSecret == null || clientSecret.isEmpty()) {
      Log.w(TAG, "[PAYMENT_TRACE] stage=payment_operation_failure reason=client_secret_missing");
      setOperationState(OperationState.FAILED, "client_secret_missing");
      call.reject("client-secret-required");
      return;
    }

    collectingPayment = true;
    setKeepScreenOn(true);
    status = "collecting";
    setOperationState(OperationState.RETRIEVING_PAYMENT_INTENT, "collect_payment_start");
    notifyListeners("statusChanged", new JSObject().put("status", status));
    notifyListeners("paymentStatusChanged", new JSObject().put("status", "creating_payment"));

    Log.d(TAG, "[PAYMENT_TRACE] stage=retrieve_payment_intent_start");
    Log.d(TAG, "[TAP_SESSION_TRACE] stage=retrieve_start ts=" + System.currentTimeMillis());

    // Retrieve PaymentIntent from Stripe
    Terminal.getInstance().retrievePaymentIntent(
      clientSecret,
      new PaymentIntentCallback() {
        @Override
        public void onSuccess(@NonNull PaymentIntent paymentIntent) {
          Log.d(TAG, "[PAYMENT_TRACE] stage=retrieve_payment_intent_success payment_intent_id=" + paymentIntent.getId() + " payment_intent_status=" + paymentIntent.getStatus());
          Log.d(TAG, "[TAP_SESSION_TRACE] stage=retrieve_success payment_intent_id=" + paymentIntent.getId() + " ts=" + System.currentTimeMillis());
          setOperationState(OperationState.COLLECTING_PAYMENT_METHOD, "retrieve_success");
          notifyListeners("paymentStatusChanged", new JSObject().put("status", "retrieving_payment_intent"));
          JSObject m = new JSObject(); m.put("paymentIntentId", paymentIntent.getId()); emitDiag("retrieve_payment_intent_completed", "payment_intent", collectCorrelationId, m);

          // Collect payment method
          collectPaymentMethod(paymentIntent, call, collectCorrelationId);
        }

        @Override
        public void onFailure(@NonNull TerminalException e) {
          Log.d(TAG, "[PAYMENT_TRACE] stage=retrieve_payment_intent_failure error_code=" + e.getErrorCode());
          Log.d(TAG, "[TAP_SESSION_TRACE] stage=retrieve_failure code=" + e.getErrorCode() + " ts=" + System.currentTimeMillis());
          collectingPayment = false;
          setKeepScreenOn(false);
          status = "error";
          setOperationState(OperationState.FAILED, "retrieve_failure");

          JSObject err = createStructuredError("retrieve_payment_intent", e);
          err.put("deviceState", captureDeviceState());
          notifyListeners("error", err);
          notifyListeners("paymentStatusChanged", new JSObject().put("status", "payment_failed").put("error", err));

          Log.d(TAG, "[PAYMENT_TRACE] stage=payment_operation_failure stage=retrieve_payment_intent");
          // Pass structured error to JS via rejection
          call.reject("retrieve_payment_intent", err);
          JSObject d = new JSObject(); if (e.getErrorCode() != null) d.put("code", e.getErrorCode().toString()); d.put("message", e.getMessage()); emitDiag("retrieve_payment_intent_failed", "payment_intent", collectCorrelationId, d);
        }
      }
    );
  }
  
  private void collectPaymentMethod(PaymentIntent paymentIntent, PluginCall originalCall, final String correlationId) {
    Log.d(TAG, "[PAYMENT_TRACE] stage=collect_payment_method_start payment_intent_id=" + paymentIntent.getId() + " payment_intent_status=" + paymentIntent.getStatus());
    Log.d(TAG, "[TAP_SESSION_TRACE] stage=collect_start payment_intent_id=" + paymentIntent.getId() + " ts=" + System.currentTimeMillis());
    setOperationState(OperationState.COLLECTING_PAYMENT_METHOD, "collect_start");
    notifyListeners("paymentStatusChanged", new JSObject().put("status", "waiting_for_card"));
    JSObject m0 = new JSObject(); m0.put("paymentIntentId", paymentIntent.getId()); emitDiag("collect_payment_method_started", "collect_payment", correlationId, m0);

    paymentCancelable = Terminal.getInstance().collectPaymentMethod(
      paymentIntent,
      new PaymentIntentCallback() {
        @Override
        public void onSuccess(@NonNull PaymentIntent collectedIntent) {
          Log.d(TAG, "[PAYMENT_TRACE] stage=collect_payment_method_success payment_intent_id=" + collectedIntent.getId() + " payment_intent_status=" + collectedIntent.getStatus());
          Log.d(TAG, "[TAP_SESSION_TRACE] stage=collect_success payment_intent_id=" + collectedIntent.getId() + " ts=" + System.currentTimeMillis());
          setOperationState(OperationState.CONFIRMING_PAYMENT_INTENT, "collect_success");
          notifyListeners("paymentStatusChanged", new JSObject().put("status", "confirming_payment"));
          JSObject m = new JSObject(); m.put("paymentIntentId", collectedIntent.getId()); emitDiag("collect_payment_method_completed", "collect_payment", correlationId, m);

          // CRITICAL FIX: collectPaymentMethod only collects the card, it does NOT confirm/charge
          // We must call confirmPaymentIntent to actually charge the card
          // For card_present payments, this is required to move from requires_payment_method to succeeded
          confirmPaymentIntent(collectedIntent, originalCall, correlationId);
        }

        @Override
        public void onFailure(@NonNull TerminalException e) {
          Log.d(TAG, "[PAYMENT_TRACE] stage=collect_payment_method_failure error_code=" + e.getErrorCode());
          Log.d(TAG, "[TAP_SESSION_TRACE] stage=collect_failure code=" + e.getErrorCode() + " ts=" + System.currentTimeMillis());
          collectingPayment = false;
          setKeepScreenOn(false);
          status = "error";
          setOperationState(OperationState.FAILED, "collect_failure");

          JSObject err = createStructuredError("collect_payment_method", e);
          err.put("deviceState", captureDeviceState());
          notifyListeners("error", err);
          notifyListeners("paymentStatusChanged", new JSObject().put("status", "payment_failed").put("error", err));

          Log.d(TAG, "[PAYMENT_TRACE] stage=payment_operation_failure stage=collect_payment_method");
          // Pass structured error to JS via rejection
          originalCall.reject("collect_payment_method", err);
          JSObject d = new JSObject(); if (e.getErrorCode() != null) d.put("code", e.getErrorCode().toString()); d.put("message", e.getMessage()); emitDiag("collect_payment_method_failed", "collect_payment", correlationId, d);
        }
      }
    );
  }

  private void confirmPaymentIntent(PaymentIntent paymentIntent, PluginCall originalCall, final String correlationId) {
    Log.d(TAG, "[PAYMENT_TRACE] stage=confirm_payment_intent_start payment_intent_id=" + paymentIntent.getId() + " payment_intent_status=" + paymentIntent.getStatus());
    Log.d(TAG, "[TAP_SESSION_TRACE] stage=confirm_start payment_intent_id=" + paymentIntent.getId() + " ts=" + System.currentTimeMillis());
    JSObject c0 = new JSObject(); c0.put("paymentIntentId", paymentIntent.getId()); emitDiag("confirm_payment_intent_started", "confirm_payment", correlationId, c0);

    paymentCancelable = Terminal.getInstance().confirmPaymentIntent(
      paymentIntent,
      new PaymentIntentCallback() {
        @Override
        public void onSuccess(@NonNull PaymentIntent confirmedIntent) {
          Log.d(TAG, "[PAYMENT_TRACE] stage=confirm_payment_intent_success payment_intent_id=" + confirmedIntent.getId() + " payment_intent_status=" + confirmedIntent.getStatus());
          Log.d(TAG, "[TAP_SESSION_TRACE] stage=confirm_success payment_intent_id=" + confirmedIntent.getId() + " status=" + confirmedIntent.getStatus() + " ts=" + System.currentTimeMillis());
          collectingPayment = false;
          setKeepScreenOn(false);
          status = "ready";
          JSObject c = new JSObject(); c.put("paymentIntentId", confirmedIntent.getId()); emitDiag("confirm_payment_intent_completed", "confirm_payment", correlationId, c);

          // Only emit success if PaymentIntent is actually succeeded
          if (confirmedIntent.getStatus() == PaymentIntentStatus.SUCCEEDED) {
            setOperationState(OperationState.SUCCEEDED, "confirm_success_succeeded");
            Log.d(TAG, "[PAYMENT_TRACE] stage=payment_operation_complete payment_intent_id=" + confirmedIntent.getId());
            notifyListeners("paymentStatusChanged", new JSObject().put("status", "payment_succeeded").put("paymentIntentId", confirmedIntent.getId()));

            JSObject result = new JSObject();
            result.put("status", "succeeded");
            result.put("paymentIntentId", confirmedIntent.getId());

            notifyListeners("paymentSucceeded", result);

            originalCall.resolve(result);
          } else {
            // PaymentIntent is not succeeded - emit appropriate non-success state
            setOperationState(OperationState.IDLE, "confirm_success_not_succeeded");
            Log.d(TAG, "[PAYMENT_TRACE] stage=payment_operation_complete status=" + confirmedIntent.getStatus() + " payment_intent_id=" + confirmedIntent.getId());

            JSObject result = new JSObject();
            result.put("status", confirmedIntent.getStatus().toString());
            result.put("paymentIntentId", confirmedIntent.getId());

            notifyListeners("paymentStatusChanged", new JSObject().put("status", confirmedIntent.getStatus().toString()).put("paymentIntentId", confirmedIntent.getId()));

            // For non-terminal states, still resolve but with the actual status
            // The server reconciliation will handle the final state
            originalCall.resolve(result);
          }
        }

        @Override
        public void onFailure(@NonNull TerminalException e) {
          Log.d(TAG, "[PAYMENT_TRACE] stage=confirm_payment_intent_failure error_code=" + e.getErrorCode());
          Log.d(TAG, "[TAP_SESSION_TRACE] stage=confirm_failure code=" + e.getErrorCode() + " ts=" + System.currentTimeMillis());
          collectingPayment = false;
          setKeepScreenOn(false);
          status = "error";
          setOperationState(OperationState.FAILED, "confirm_failure");

          JSObject err = createStructuredError("confirm_payment_intent", e);
          err.put("deviceState", captureDeviceState());
          notifyListeners("error", err);
          notifyListeners("paymentStatusChanged", new JSObject().put("status", "payment_failed").put("error", err));

          Log.d(TAG, "[PAYMENT_TRACE] stage=payment_operation_failure stage=confirm_payment_intent");
          // Pass structured error to JS via rejection
          originalCall.reject("confirm_payment_intent", err);
          JSObject d = new JSObject(); if (e.getErrorCode() != null) d.put("code", e.getErrorCode().toString()); d.put("message", e.getMessage()); emitDiag("confirm_payment_intent_failed", "confirm_payment", correlationId, d);
        }
      }
    );
  }

  @PluginMethod
  public void cancel(PluginCall call) {
    final String cancelCorrelationId = call.getString("diagnosticAttemptId");
    Log.d(TAG, "[PAYMENT_TRACE] stage=payment_operation_canceled collecting=" + collectingPayment + " discovering=" + discovering + " operation_state=" + operationState);
    setOperationState(OperationState.CANCELING, "cancel_start");
    emitDiag("cancel_called", "cancel", cancelCorrelationId, null);

    // Cancel ongoing payment collection
    if (collectingPayment && paymentCancelable != null) {
      Log.d(TAG, "[PAYMENT_TRACE] stage=cancel_payment_start");
      paymentCancelable.cancel(new com.stripe.stripeterminal.external.callable.Callback() {
        @Override
        public void onSuccess() {
          Log.d(TAG, "[PAYMENT_TRACE] stage=cancel_payment_success");
          collectingPayment = false;
          setKeepScreenOn(false);
          status = "ready";
          setOperationState(OperationState.IDLE, "cancel_success");
          Log.d(TAG, "[PAYMENT_TRACE] stage=payment_operation_guard_cleared");
          notifyListeners("statusChanged", new JSObject().put("status", status));
          notifyListeners("paymentStatusChanged", new JSObject().put("status", "canceled"));
          emitDiag("cancel_completed", "cancel", cancelCorrelationId, null);
        }

        @Override
        public void onFailure(@NonNull TerminalException e) {
          Log.d(TAG, "[PAYMENT_TRACE] stage=cancel_payment_failure error_code=" + e.getErrorCode());
          // Even if cancel fails, clear the guard to allow retry
          // The Stripe SDK will handle the actual cleanup
          collectingPayment = false;
          setKeepScreenOn(false);
          status = "ready";
          setOperationState(OperationState.IDLE, "cancel_failure_guard_cleared");
          Log.d(TAG, "[PAYMENT_TRACE] stage=payment_operation_guard_cleared");
          JSObject err = createStructuredError("cancel_payment", e);
          err.put("deviceState", captureDeviceState());
          notifyListeners("error", err);
          JSObject d = new JSObject(); if (e.getErrorCode() != null) d.put("code", e.getErrorCode().toString()); d.put("message", e.getMessage()); emitDiag("cancel_failed", "cancel", cancelCorrelationId, d);
        }
      });
    } else if (collectingPayment) {
      // collectingPayment is true but paymentCancelable is null - clear guard to allow retry
      Log.d(TAG, "[PAYMENT_TRACE] stage=clear_stale_payment_guard");
      collectingPayment = false;
      setKeepScreenOn(false);
      status = "ready";
      setOperationState(OperationState.IDLE, "clear_stale_guard");
      Log.d(TAG, "[PAYMENT_TRACE] stage=payment_operation_guard_cleared");
    }

    // Cancel ongoing discovery
    if (discovering && discoveryCancelable != null) {
      Log.d(TAG, "[PAYMENT_TRACE] stage=cancel_discovery_start");
      discoveryCancelable.cancel(new com.stripe.stripeterminal.external.callable.Callback() {
        @Override
        public void onSuccess() {
          Log.d(TAG, "[PAYMENT_TRACE] stage=cancel_discovery_success");
          discovering = false;
          status = "ready";
          setOperationState(OperationState.IDLE, "cancel_discovery_success");
          notifyListeners("statusChanged", new JSObject().put("status", status));
        }

        @Override
        public void onFailure(@NonNull TerminalException e) {
          Log.d(TAG, "[PAYMENT_TRACE] stage=cancel_discovery_failure error_code=" + e.getErrorCode());
          discovering = false;
          status = "ready";
          setOperationState(OperationState.IDLE, "cancel_discovery_failure");
          JSObject err = createStructuredError("cancel_discovery", e);
          err.put("deviceState", captureDeviceState());
          notifyListeners("error", err);
        }
      });
    } else if (discovering) {
      // discovering is true but discoveryCancelable is null - clear guard
      Log.d(TAG, "[PAYMENT_TRACE] stage=clear_stale_discovery_guard");
      discovering = false;
      status = "ready";
      setOperationState(OperationState.IDLE, "clear_stale_discovery_guard");
    }

    JSObject ret = new JSObject();
    ret.put("status", status);
    call.resolve(ret);
  }

  @PluginMethod
  public void disconnect(PluginCall call) {
    final String disconnectCorrelationId = call.getString("diagnosticAttemptId");
    if (connectedReader != null) {
      emitDiag("disconnect_called", "disconnect", disconnectCorrelationId, null);
      Terminal.getInstance().disconnectReader(new com.stripe.stripeterminal.external.callable.Callback() {
        @Override
        public void onSuccess() {
          connectedReader = null;
          status = "ready";
          notifyListeners("statusChanged", new JSObject().put("status", status));
          emitDiag("disconnect_completed", "disconnect", disconnectCorrelationId, null);
        }

        @Override
        public void onFailure(@NonNull TerminalException e) {
          JSObject err = new JSObject();
          err.put("code", mapTerminalErrorCode(e.getErrorCode()));
          err.put("message", e.getMessage());
          notifyListeners("error", err);
          JSObject d = new JSObject(); if (e.getErrorCode() != null) d.put("code", e.getErrorCode().toString()); d.put("message", e.getMessage()); emitDiag("disconnect_failed", "disconnect", disconnectCorrelationId, d);
        }
      });
    }
    
    JSObject ret = new JSObject();
    ret.put("status", status);
    call.resolve(ret);
  }

  @PluginMethod
  public void teardown(PluginCall call) {
    // Cancel any ongoing discovery
    if (discovering && discoveryCancelable != null) {
      discoveryCancelable.cancel(new com.stripe.stripeterminal.external.callable.Callback() {
        @Override
        public void onSuccess() {
          discovering = false;
        }

        @Override
        public void onFailure(@NonNull TerminalException e) {
          // Ignore errors during teardown
        }
      });
    }
    
    // Disconnect reader if connected
    if (connectedReader != null) {
      Terminal.getInstance().disconnectReader(new com.stripe.stripeterminal.external.callable.Callback() {
        @Override
        public void onSuccess() {
          connectedReader = null;
        }

        @Override
        public void onFailure(@NonNull TerminalException e) {
          // Ignore errors during teardown
        }
      });
    }
    
    // Clear all pending token requests
    for (PendingTokenRequest request : pendingTokenRequests.values()) {
      if (request.timeoutThread != null) {
        request.timeoutThread.interrupt();
      }
    }
    pendingTokenRequests.clear();
    
    status = "not_initialized";
    initialized = false;
    
    JSObject ret = new JSObject();
    ret.put("status", status);
    call.resolve(ret);
  }

  private class JsBridgedConnectionTokenProvider implements ConnectionTokenProvider {
    @Override
    public void fetchConnectionToken(ConnectionTokenCallback callback) {
      synchronized (pendingTokenRequests) {
        // Reuse an existing pending request if present to avoid multiple overlapping requestIds
        PendingTokenRequest existing = null;
        for (PendingTokenRequest p : pendingTokenRequests.values()) { existing = p; break; }
        if (existing != null && !existing.completed.get()) {
          existing.addCallback(callback);
          Log.d(TAG, "[TOKEN_TRACE] stage=native_request_coalesced existingRequestId=" + existing.requestId);
          return;
        }

        // Generate unique request ID for this token request
        String requestId = UUID.randomUUID().toString();
        Log.d(TAG, "[TOKEN_TRACE] stage=native_request_created requestId=" + requestId);

        // Create pending request record
        PendingTokenRequest request = new PendingTokenRequest(requestId);
        request.addCallback(callback);
        pendingTokenRequests.put(requestId, request);
        Log.d(TAG, "[TOKEN_TRACE] stage=native_request_stored requestId=" + requestId + " pendingCount=" + pendingTokenRequests.size());

        // Emit event to JS to request token with requestId
        JSObject payload = new JSObject();
        payload.put("requestId", requestId);
        notifyListeners("connectionTokenRequested", payload);
        Log.d(TAG, "[TOKEN_TRACE] stage=native_event_emitted requestId=" + requestId + " eventName=connectionTokenRequested");

        // Start timeout thread
        Thread timeoutThread = new Thread(() -> {
          try {
            Thread.sleep(10000); // 10 second timeout
          } catch (InterruptedException e) {
            // Thread was interrupted (token supplied successfully)
            Log.d(TAG, "[TOKEN_TRACE] stage=native_timeout_interrupted requestId=" + requestId);
            return;
          }

          // Timeout elapsed - check if still pending and complete
          PendingTokenRequest pending = pendingTokenRequests.get(requestId);
          if (pending != null && pending.completed.compareAndSet(false, true)) {
            // Still pending - complete with timeout error
            pendingTokenRequests.remove(requestId);
            synchronized (pending.callbacks) {
              for (ConnectionTokenCallback cb : pending.callbacks) {
                try { cb.onFailure(new ConnectionTokenException("Failed to fetch connection token: timeout")); } catch (Exception ignore) {}
              }
            }
            Log.w(TAG, "[TOKEN_TRACE] stage=native_timeout_fired requestId=" + requestId);
          } else {
            Log.d(TAG, "[TOKEN_TRACE] stage=native_timeout_skipped requestId=" + requestId + " alreadyCompleted=true");
          }
        });
        request.timeoutThread = timeoutThread;
        timeoutThread.start();
      }
    }
  }

  private class BasicTerminalListener implements TerminalListener {
    // Intentionally minimal for Phase 2B
  }
}
