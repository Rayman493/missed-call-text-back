package com.replyflowhq.terminal;

import androidx.annotation.NonNull;

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
import com.stripe.stripeterminal.external.interfaces.TerminalListener;
import com.stripe.stripeterminal.external.models.ConnectionTokenException;
import com.stripe.stripeterminal.external.models.Reader;
import com.stripe.stripeterminal.external.models.DiscoveryListener;
import com.stripe.stripeterminal.external.models.DiscoveryConfiguration;
import com.stripe.stripeterminal.taptopay.discovery.TapToPayDiscoveryConfiguration;
import com.stripe.stripeterminal.external.models.TerminalException;

@CapacitorPlugin(name = "ReplyflowStripeTerminal")
public class ReplyflowStripeTerminalPlugin extends Plugin {
  private String status = "not_initialized";
  private volatile boolean initialized = false;

  // Simple token handoff mechanism: JS must call supplyConnectionToken when requested
  private final Object tokenLock = new Object();
  private String pendingToken = null;

  @PluginMethod
  public void initialize(PluginCall call) {
    if (!initialized) {
      try {
        Terminal.initTerminal(
          getContext().getApplicationContext(),
          LogLevel.VERBOSE,
          new JsBridgedConnectionTokenProvider(),
          new BasicTerminalListener()
        );
        initialized = true;
      } catch (Exception e) {
        JSObject err = new JSObject();
        err.put("message", e.getMessage());
        call.reject("terminal-init-failed", err);
        return;
      }
    }
    status = "ready";
    JSObject ret = new JSObject();
    ret.put("status", status);
    call.resolve(ret);
  }

  @PluginMethod
  public void isSupported(PluginCall call) {
    boolean osOk = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU; // Android 13+
    boolean hasNfc = getContext().getPackageManager().hasSystemFeature(PackageManager.FEATURE_NFC);
    JSObject ret = new JSObject();
    ret.put("supported", osOk && hasNfc);
    ret.put("platform", "android");
    ret.put("osOk", osOk);
    ret.put("nfc", hasNfc);
    call.resolve(ret);
  }

  @PluginMethod
  public void requestConnectionToken(PluginCall call) {
    // Ask JS to provide a token via a subsequent supplyConnectionToken call
    notifyListeners("statusChanged", new JSObject().put("status", "requesting_token"));
    synchronized (tokenLock) {
      pendingToken = null;
    }
    call.resolve();
  }

  @PluginMethod
  public void supplyConnectionToken(PluginCall call) {
    String token = call.getString("secret");
    if (token == null || token.isEmpty()) {
      call.reject("invalid-token");
      return;
    }
    synchronized (tokenLock) {
      pendingToken = token;
      tokenLock.notifyAll();
    }
    call.resolve();
  }

  @PluginMethod
  public void connectTapToPay(PluginCall call) {
    if (!initialized) {
      call.reject("not-initialized");
      return;
    }
    status = "connecting";
    notifyListeners("statusChanged", new JSObject().put("status", status));

    // Scaffold discovery to validate device; do not actually connect in this phase
    TapToPayDiscoveryConfiguration cfg = new TapToPayDiscoveryConfiguration(/* isSimulated= */ true);
    Terminal.getInstance().discoverReaders(cfg, new DiscoveryListener() {
      @Override
      public void onUpdateDiscoveredReaders(@NonNull java.util.List<Reader> readers) {
        JSObject evt = new JSObject();
        evt.put("readers", readers.size());
        notifyListeners("statusChanged", new JSObject().put("status", "discovered"));
      }
    }, new com.stripe.stripeterminal.external.callable.Callback() {
      @Override
      public void onSuccess() {
        status = "ready";
        notifyListeners("statusChanged", new JSObject().put("status", status));
      }

      @Override
      public void onFailure(@NonNull TerminalException e) {
        JSObject err = new JSObject();
        err.put("code", e.getErrorCode() != null ? e.getErrorCode().toString() : "unknown");
        err.put("message", e.getMessage());
        notifyListeners("error", err);
        status = "error";
        notifyListeners("statusChanged", new JSObject().put("status", status));
      }
    });

    JSObject ret = new JSObject();
    ret.put("status", status);
    call.resolve(ret);
  }

  @PluginMethod
  public void collectPayment(PluginCall call) {
    JSObject ret = new JSObject();
    ret.put("status", "failed");
    JSObject err = new JSObject();
    err.put("message", "Not implemented in scaffold");
    ret.put("error", err);
    call.resolve(ret);
  }

  @PluginMethod
  public void cancel(PluginCall call) {
    JSObject ret = new JSObject();
    ret.put("status", "canceled");
    call.resolve(ret);
  }

  @PluginMethod
  public void disconnect(PluginCall call) {
    JSObject ret = new JSObject();
    ret.put("status", "ready");
    call.resolve(ret);
  }

  @PluginMethod
  public void teardown(PluginCall call) {
    status = "not_initialized";
    JSObject ret = new JSObject();
    ret.put("status", status);
    call.resolve(ret);
  }

  private class JsBridgedConnectionTokenProvider implements ConnectionTokenProvider {
    @Override
    public String fetchConnectionToken() throws ConnectionTokenException {
      // Request token from JS; wait for supplyConnectionToken
      notifyListeners("statusChanged", new JSObject().put("status", "requesting_token"));
      synchronized (tokenLock) {
        pendingToken = null;
        long start = System.currentTimeMillis();
        long timeoutMs = 15000; // 15s timeout
        while (pendingToken == null && System.currentTimeMillis() - start < timeoutMs) {
          try {
            tokenLock.wait(250);
          } catch (InterruptedException ignored) {}
        }
        if (pendingToken == null) {
          throw new ConnectionTokenException("timeout waiting for connection token");
        }
        String t = pendingToken;
        pendingToken = null;
        return t;
      }
    }
  }

  private class BasicTerminalListener implements TerminalListener {
    // Intentionally minimal for Phase 2B
  }
}
