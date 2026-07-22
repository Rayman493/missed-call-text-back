package com.replyflowhq.terminal;

import androidx.annotation.NonNull;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ReplyflowStripeTerminal")
public class ReplyflowStripeTerminalPlugin extends Plugin {
  private String status = "not_initialized";

  @PluginMethod
  public void initialize(PluginCall call) {
    status = "ready"; // Scaffold: native SDK not wired yet
    JSObject ret = new JSObject();
    ret.put("status", status);
    call.resolve(ret);
  }

  @PluginMethod
  public void isSupported(PluginCall call) {
    JSObject ret = new JSObject();
    ret.put("supported", false); // Until SDK integrated
    ret.put("platform", "android");
    call.resolve(ret);
  }

  @PluginMethod
  public void requestConnectionToken(PluginCall call) {
    call.reject("token-provider-not-configured");
  }

  @PluginMethod
  public void connectTapToPay(PluginCall call) {
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
}
