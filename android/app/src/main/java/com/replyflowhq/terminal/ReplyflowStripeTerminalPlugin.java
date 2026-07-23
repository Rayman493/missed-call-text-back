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
  private static final String BUILD_MARKER = "TAP_TO_PAY_DEEP_AUDIT_2026_07_22_V4";

  // Initialization state tracking
  private enum InitState {
    NOT_INITIALIZED,
    INITIALIZING,
    INITIALIZED,
    FAILED
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

      JSObject ret = new JSObject();
      ret.put("status", status);
      call.resolve(ret);
      return;
    }

    discovering = true;
    status = "discovering";
    notifyListeners("statusChanged", new JSObject().put("status", status));

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
    Log.d(TAG, "[PAYMENT_TRACE] stage=payment_operation_start reader_connected=" + (connectedReader != null) + " connection_status=" + status + " operation_state=" + operationState);

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
    status = "collecting";
    setOperationState(OperationState.RETRIEVING_PAYMENT_INTENT, "collect_payment_start");
    notifyListeners("statusChanged", new JSObject().put("status", status));
    notifyListeners("paymentStatusChanged", new JSObject().put("status", "creating_payment"));

    Log.d(TAG, "[PAYMENT_TRACE] stage=retrieve_payment_intent_start");

    // Retrieve PaymentIntent from Stripe
    Terminal.getInstance().retrievePaymentIntent(
      clientSecret,
      new PaymentIntentCallback() {
        @Override
        public void onSuccess(@NonNull PaymentIntent paymentIntent) {
          Log.d(TAG, "[PAYMENT_TRACE] stage=retrieve_payment_intent_success payment_intent_id=" + paymentIntent.getId() + " payment_intent_status=" + paymentIntent.getStatus());
          setOperationState(OperationState.COLLECTING_PAYMENT_METHOD, "retrieve_success");
          notifyListeners("paymentStatusChanged", new JSObject().put("status", "retrieving_payment_intent"));

          // Collect payment method
          collectPaymentMethod(paymentIntent, call);
        }

        @Override
        public void onFailure(@NonNull TerminalException e) {
          Log.d(TAG, "[PAYMENT_TRACE] stage=retrieve_payment_intent_failure error_code=" + e.getErrorCode());
          collectingPayment = false;
          status = "error";
          setOperationState(OperationState.FAILED, "retrieve_failure");

          JSObject err = createStructuredError("retrieve_payment_intent", e);
          err.put("deviceState", captureDeviceState());
          notifyListeners("error", err);
          notifyListeners("paymentStatusChanged", new JSObject().put("status", "payment_failed").put("error", err));

          Log.d(TAG, "[PAYMENT_TRACE] stage=payment_operation_failure stage=retrieve_payment_intent");
          // Pass structured error to JS via rejection
          call.reject("retrieve_payment_intent", err);
        }
      }
    );
  }
  
  private void collectPaymentMethod(PaymentIntent paymentIntent, PluginCall originalCall) {
    Log.d(TAG, "[PAYMENT_TRACE] stage=collect_payment_method_start payment_intent_id=" + paymentIntent.getId() + " payment_intent_status=" + paymentIntent.getStatus());
    setOperationState(OperationState.COLLECTING_PAYMENT_METHOD, "collect_start");
    notifyListeners("paymentStatusChanged", new JSObject().put("status", "waiting_for_card"));

    paymentCancelable = Terminal.getInstance().collectPaymentMethod(
      paymentIntent,
      new PaymentIntentCallback() {
        @Override
        public void onSuccess(@NonNull PaymentIntent collectedIntent) {
          Log.d(TAG, "[PAYMENT_TRACE] stage=collect_payment_method_success payment_intent_id=" + collectedIntent.getId() + " payment_intent_status=" + collectedIntent.getStatus());
          setOperationState(OperationState.CONFIRMING_PAYMENT_INTENT, "collect_success");
          notifyListeners("paymentStatusChanged", new JSObject().put("status", "confirming_payment"));

          // CRITICAL FIX: collectPaymentMethod only collects the card, it does NOT confirm/charge
          // We must call confirmPaymentIntent to actually charge the card
          // For card_present payments, this is required to move from requires_payment_method to succeeded
          confirmPaymentIntent(collectedIntent, originalCall);
        }

        @Override
        public void onFailure(@NonNull TerminalException e) {
          Log.d(TAG, "[PAYMENT_TRACE] stage=collect_payment_method_failure error_code=" + e.getErrorCode());
          collectingPayment = false;
          status = "error";
          setOperationState(OperationState.FAILED, "collect_failure");

          JSObject err = createStructuredError("collect_payment_method", e);
          err.put("deviceState", captureDeviceState());
          notifyListeners("error", err);
          notifyListeners("paymentStatusChanged", new JSObject().put("status", "payment_failed").put("error", err));

          Log.d(TAG, "[PAYMENT_TRACE] stage=payment_operation_failure stage=collect_payment_method");
          // Pass structured error to JS via rejection
          originalCall.reject("collect_payment_method", err);
        }
      }
    );
  }

  private void confirmPaymentIntent(PaymentIntent paymentIntent, PluginCall originalCall) {
    Log.d(TAG, "[PAYMENT_TRACE] stage=confirm_payment_intent_start payment_intent_id=" + paymentIntent.getId() + " payment_intent_status=" + paymentIntent.getStatus());

    paymentCancelable = Terminal.getInstance().confirmPaymentIntent(
      paymentIntent,
      new PaymentIntentCallback() {
        @Override
        public void onSuccess(@NonNull PaymentIntent confirmedIntent) {
          Log.d(TAG, "[PAYMENT_TRACE] stage=confirm_payment_intent_success payment_intent_id=" + confirmedIntent.getId() + " payment_intent_status=" + confirmedIntent.getStatus());
          collectingPayment = false;
          status = "ready";

          // Only emit success if PaymentIntent is actually succeeded
          if (confirmedIntent.getStatus() == PaymentIntent.Status.SUCCEEDED) {
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
          collectingPayment = false;
          status = "error";
          setOperationState(OperationState.FAILED, "confirm_failure");

          JSObject err = createStructuredError("confirm_payment_intent", e);
          err.put("deviceState", captureDeviceState());
          notifyListeners("error", err);
          notifyListeners("paymentStatusChanged", new JSObject().put("status", "payment_failed").put("error", err));

          Log.d(TAG, "[PAYMENT_TRACE] stage=payment_operation_failure stage=confirm_payment_intent");
          // Pass structured error to JS via rejection
          originalCall.reject("confirm_payment_intent", err);
        }
      }
    );
  }

  @PluginMethod
  public void cancel(PluginCall call) {
    Log.d(TAG, "[PAYMENT_TRACE] stage=payment_operation_canceled collecting=" + collectingPayment + " discovering=" + discovering + " operation_state=" + operationState);
    setOperationState(OperationState.CANCELING, "cancel_start");

    // Cancel ongoing payment collection
    if (collectingPayment && paymentCancelable != null) {
      Log.d(TAG, "[PAYMENT_TRACE] stage=cancel_payment_start");
      paymentCancelable.cancel(new com.stripe.stripeterminal.external.callable.Callback() {
        @Override
        public void onSuccess() {
          Log.d(TAG, "[PAYMENT_TRACE] stage=cancel_payment_success");
          collectingPayment = false;
          status = "ready";
          setOperationState(OperationState.IDLE, "cancel_success");
          Log.d(TAG, "[PAYMENT_TRACE] stage=payment_operation_guard_cleared");
          notifyListeners("statusChanged", new JSObject().put("status", status));
          notifyListeners("paymentStatusChanged", new JSObject().put("status", "canceled"));
        }

        @Override
        public void onFailure(@NonNull TerminalException e) {
          Log.d(TAG, "[PAYMENT_TRACE] stage=cancel_payment_failure error_code=" + e.getErrorCode());
          // Even if cancel fails, clear the guard to allow retry
          // The Stripe SDK will handle the actual cleanup
          collectingPayment = false;
          status = "ready";
          setOperationState(OperationState.IDLE, "cancel_failure_guard_cleared");
          Log.d(TAG, "[PAYMENT_TRACE] stage=payment_operation_guard_cleared");
          JSObject err = createStructuredError("cancel_payment", e);
          err.put("deviceState", captureDeviceState());
          notifyListeners("error", err);
        }
      });
    } else if (collectingPayment) {
      // collectingPayment is true but paymentCancelable is null - clear guard to allow retry
      Log.d(TAG, "[PAYMENT_TRACE] stage=clear_stale_payment_guard");
      collectingPayment = false;
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
