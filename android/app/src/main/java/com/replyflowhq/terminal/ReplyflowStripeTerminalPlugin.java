package com.replyflowhq.terminal;

import androidx.annotation.NonNull;
import android.util.Log;

import java.util.UUID;
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
import com.stripe.stripeterminal.external.models.LocaleConfig;
import com.stripe.stripeterminal.external.callable.PaymentIntentCallback;
import java.util.Locale;

@CapacitorPlugin(name = "ReplyflowStripeTerminal")
public class ReplyflowStripeTerminalPlugin extends Plugin {
  private static final String TAG = "ReplyflowStripeTerminal";
  private static final String BUILD_MARKER = "TAP_TO_PAY_REAL_NFC_DIAGNOSTIC_2026_07_22_V2";

  // Initialization state tracking
  private enum InitState {
    NOT_INITIALIZED,
    INITIALIZING,
    INITIALIZED,
    FAILED
  }

  private volatile InitState initState = InitState.NOT_INITIALIZED;
  private final Object initLock = new Object();

  @Override
  public void load() {
    super.load();
    Log.d(TAG, "[PLUGIN] ReplyflowStripeTerminalPlugin.load() executed - plugin loaded successfully");
    Log.d(TAG, "[PLUGIN] Build marker: " + BUILD_MARKER);
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
    final ConnectionTokenCallback callback;
    final AtomicBoolean completed;
    Thread timeoutThread;

    PendingTokenRequest(String requestId, ConnectionTokenCallback callback) {
      this.requestId = requestId;
      this.callback = callback;
      this.completed = new AtomicBoolean(false);
    }
  }

  private final ConcurrentHashMap<String, PendingTokenRequest> pendingTokenRequests = new ConcurrentHashMap<>();

  @PluginMethod
  public void initialize(PluginCall call) {
    Log.d(TAG, "[STRIPE_TERMINAL_INIT] Starting initialization");
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
    } catch (Exception e) {
      Log.e(TAG, "[STRIPE_TERMINAL_INIT] Terminal.init() failed", e);
      Log.e(TAG, "[STRIPE_TERMINAL_INIT] Exception class: " + e.getClass().getName());
      Log.e(TAG, "[STRIPE_TERMINAL_INIT] Exception message: " + e.getMessage());
      if (e.getCause() != null) {
        Log.e(TAG, "[STRIPE_TERMINAL_INIT] Exception cause: " + e.getCause().getClass().getName() + ": " + e.getCause().getMessage());
      }

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
      request.callback.onSuccess(secret);
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
      request.callback.onFailure(new ConnectionTokenException(message));
      Log.d(TAG, "[TOKEN] supplyConnectionTokenError: failure for requestId: " + requestId);
    } else {
      // Already completed (timeout already fired)
      Log.w(TAG, "[TOKEN] supplyConnectionTokenError: request already completed, ignoring: " + requestId);
    }

    call.resolve();
  }

  @PluginMethod
  public void connectTapToPay(PluginCall call) {
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

    // Check if app is debuggable - Stripe does not allow real Tap to Pay in debuggable builds
    boolean isDebuggable = (getContext().getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    boolean effectiveSimulated = isDebuggable ? true : requestedSimulated;

    Log.d(TAG, "[TAP_TO_PAY_MODE] app_debuggable=" + isDebuggable + " requested_simulated=" + requestedSimulated + " effective_simulated=" + effectiveSimulated);

    if (isDebuggable && !requestedSimulated) {
      Log.w(TAG, "[TAP_TO_PAY_MODE] Debug build attempting real Tap to Pay - forcing simulated mode");
    }

    discovering = true;
    status = "discovering";
    notifyListeners("statusChanged", new JSObject().put("status", status));

    // Create Tap to Pay discovery configuration
    DiscoveryConfiguration cfg = new DiscoveryConfiguration.TapToPayDiscoveryConfiguration(
      effectiveSimulated
    );

    discoveryCancelable = Terminal.getInstance().discoverReaders(
      cfg,
      new DiscoveryListener() {
        @Override
        public void onUpdateDiscoveredReaders(@NonNull java.util.List<Reader> readers) {
          if (!readers.isEmpty()) {
            // For Tap to Pay, we expect at most one local reader
            // Auto-connect to the first discovered reader
            Reader reader = readers.get(0);
            connectToReader(reader, effectiveSimulated, locationId);
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
        }

        @Override
        public void onFailure(@NonNull TerminalException e) {
          discovering = false;
          JSObject err = createStructuredError("discover_readers", e);
          err.put("deviceState", captureDeviceState());
          notifyListeners("error", err);
          status = "error";
          notifyListeners("statusChanged", new JSObject().put("status", status));
        }
      }
    );

    JSObject ret = new JSObject();
    ret.put("status", status);
    call.resolve(ret);
  }
  
  private void connectToReader(Reader reader, boolean simulated, String locationId) {
    status = "connecting";
    notifyListeners("statusChanged", new JSObject().put("status", status));
    
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
          ReplyflowStripeTerminalPlugin.this.connectedReader = connectedReader;
          status = "connected";
          
          JSObject readerInfo = new JSObject();
          readerInfo.put("connected", true);
          readerInfo.put("readerId", connectedReader.getId());
          readerInfo.put("deviceType", connectedReader.getDeviceType().toString());
          readerInfo.put("simulated", simulated);
          
          notifyListeners("statusChanged", new JSObject().put("status", status));
          notifyListeners("readerConnected", readerInfo);
        }

        @Override
        public void onFailure(@NonNull TerminalException e) {
          JSObject err = createStructuredError("connect_reader", e);
          err.put("deviceState", captureDeviceState());
          notifyListeners("error", err);
          status = "error";
          notifyListeners("statusChanged", new JSObject().put("status", status));
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

    // Check NFC enabled state
    NfcAdapter nfcAdapter = NfcAdapter.getDefaultAdapter(getContext());
    state.put("nfcEnabled", nfcAdapter != null && nfcAdapter.isEnabled());

    return state;
  }

  @PluginMethod
  public void createTerminalPayment(PluginCall call) {
    // This is a no-op on Android - the PaymentIntent is created server-side
    // The JS layer calls the backend endpoint directly
    call.reject("createTerminalPayment should be called from JS layer via backend API");
  }

  @PluginMethod
  public void collectPayment(PluginCall call) {
    if (!initialized) {
      call.reject("not-initialized");
      return;
    }
    
    if (connectedReader == null) {
      call.reject("no-reader-connected");
      return;
    }
    
    // Prevent duplicate payment collection
    if (collectingPayment) {
      call.reject("payment-already-in-progress");
      return;
    }
    
    String clientSecret = call.getString("clientSecret");
    
    if (clientSecret == null || clientSecret.isEmpty()) {
      call.reject("client-secret-required");
      return;
    }
    
    collectingPayment = true;
    status = "collecting";
    notifyListeners("statusChanged", new JSObject().put("status", status));
    notifyListeners("paymentStatusChanged", new JSObject().put("status", "creating_payment"));
    
    // Retrieve PaymentIntent from Stripe
    Terminal.getInstance().retrievePaymentIntent(
      clientSecret,
      new PaymentIntentCallback() {
        @Override
        public void onSuccess(@NonNull PaymentIntent paymentIntent) {
          notifyListeners("paymentStatusChanged", new JSObject().put("status", "retrieving_payment_intent"));
          
          // Collect payment method
          collectPaymentMethod(paymentIntent, call);
        }
        
        @Override
        public void onFailure(@NonNull TerminalException e) {
          collectingPayment = false;
          status = "error";

          JSObject err = createStructuredError("retrieve_payment_intent", e);
          err.put("deviceState", captureDeviceState());
          notifyListeners("error", err);
          notifyListeners("paymentStatusChanged", new JSObject().put("status", "payment_failed").put("error", err));

          call.reject("Failed to retrieve PaymentIntent: " + e.getMessage());
        }
      }
    );
  }
  
  private void collectPaymentMethod(PaymentIntent paymentIntent, PluginCall originalCall) {
    notifyListeners("paymentStatusChanged", new JSObject().put("status", "waiting_for_card"));
    
    paymentCancelable = Terminal.getInstance().collectPaymentMethod(
      paymentIntent,
      new PaymentIntentCallback() {
        @Override
        public void onSuccess(@NonNull PaymentIntent collectedIntent) {
          collectingPayment = false;
          status = "ready";
          
          notifyListeners("paymentStatusChanged", new JSObject().put("status", "processing_payment"));
          
          // For card_present payments, collectPaymentMethod automatically processes the payment
          // The returned PaymentIntent should be in succeeded state
          JSObject result = new JSObject();
          result.put("status", "succeeded");
          result.put("paymentIntentId", collectedIntent.getId());
          
          notifyListeners("paymentStatusChanged", new JSObject().put("status", "payment_succeeded").put("paymentIntentId", collectedIntent.getId()));
          notifyListeners("paymentSucceeded", result);
          
          originalCall.resolve(result);
        }
        
        @Override
        public void onFailure(@NonNull TerminalException e) {
          collectingPayment = false;
          status = "error";

          JSObject err = createStructuredError("collect_payment_method", e);
          err.put("deviceState", captureDeviceState());
          notifyListeners("error", err);
          notifyListeners("paymentStatusChanged", new JSObject().put("status", "payment_failed").put("error", err));

          originalCall.reject("Failed to collect payment method: " + e.getMessage());
        }
      }
    );
  }

  @PluginMethod
  public void cancel(PluginCall call) {
    // Cancel ongoing payment collection
    if (collectingPayment && paymentCancelable != null) {
      paymentCancelable.cancel(new com.stripe.stripeterminal.external.callable.Callback() {
        @Override
        public void onSuccess() {
          collectingPayment = false;
          status = "ready";
          notifyListeners("statusChanged", new JSObject().put("status", status));
          notifyListeners("paymentStatusChanged", new JSObject().put("status", "canceled"));
        }

        @Override
        public void onFailure(@NonNull TerminalException e) {
          collectingPayment = false;
          status = "error";
          JSObject err = createStructuredError("cancel_payment", e);
          err.put("deviceState", captureDeviceState());
          notifyListeners("error", err);
        }
      });
    }
    
    // Cancel ongoing discovery
    if (discovering && discoveryCancelable != null) {
      discoveryCancelable.cancel(new com.stripe.stripeterminal.external.callable.Callback() {
        @Override
        public void onSuccess() {
          discovering = false;
          status = "ready";
          notifyListeners("statusChanged", new JSObject().put("status", status));
        }

        @Override
        public void onFailure(@NonNull TerminalException e) {
          discovering = false;
          JSObject err = createStructuredError("cancel_discovery", e);
          err.put("deviceState", captureDeviceState());
          notifyListeners("error", err);
        }
      });
    }
    
    JSObject ret = new JSObject();
    ret.put("status", status);
    call.resolve(ret);
  }

  @PluginMethod
  public void disconnect(PluginCall call) {
    if (connectedReader != null) {
      Terminal.getInstance().disconnectReader(new com.stripe.stripeterminal.external.callable.Callback() {
        @Override
        public void onSuccess() {
          connectedReader = null;
          status = "ready";
          notifyListeners("statusChanged", new JSObject().put("status", status));
        }

        @Override
        public void onFailure(@NonNull TerminalException e) {
          JSObject err = new JSObject();
          err.put("code", mapTerminalErrorCode(e.getErrorCode()));
          err.put("message", e.getMessage());
          notifyListeners("error", err);
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
      // Generate unique request ID for this token request
      String requestId = UUID.randomUUID().toString();

      Log.d(TAG, "[TOKEN_TRACE] stage=native_request_created requestId=" + requestId);

      // Create pending request record
      PendingTokenRequest request = new PendingTokenRequest(requestId, callback);
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
          pending.callback.onFailure(new ConnectionTokenException("Failed to fetch connection token: timeout"));
          Log.w(TAG, "[TOKEN_TRACE] stage=native_timeout_fired requestId=" + requestId);
        } else {
          Log.d(TAG, "[TOKEN_TRACE] stage=native_timeout_skipped requestId=" + requestId + " alreadyCompleted=true");
        }
      });
      request.timeoutThread = timeoutThread;
      timeoutThread.start();
    }
  }

  private class BasicTerminalListener implements TerminalListener {
    // Intentionally minimal for Phase 2B
  }
}
