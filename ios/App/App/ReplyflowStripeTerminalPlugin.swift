import Foundation
import Capacitor

#if canImport(UIKit)
import UIKit
#endif

#if canImport(StripeTerminal)
import StripeTerminal
#endif

@objc(ReplyflowStripeTerminalPlugin)
public class ReplyflowStripeTerminalPlugin: CAPPlugin {
  private let eventNameDiagnostics = "tpDiagnostics"

  private var initialized = false
  private var connectionStatus: String = "not_initialized"

  private let connectGuard = DispatchQueue(label: "com.replyflowhq.terminal.connectGuard")
  private var connectInFlightNative = false
  private var activeConnectOpId: String? = nil

  private var pendingTokenRequests: [String: (Result<String, Error>) -> Void] = [:]

  private func emitDiag(_ name: String, phase: String, correlationId: String? = nil, meta: [String: Any]? = nil) {
    var payload: [String: Any] = [
      "name": name,
      "phase": phase,
      "connectionStatus": self.connectionStatus,
    ]
    if let cid = correlationId { payload["attemptId"] = cid }
    if let m = meta { payload["meta"] = m }
    self.notifyListeners(eventNameDiagnostics, data: payload)
  }

  @objc public func ping(_ call: CAPPluginCall) {
    #if os(iOS)
    call.resolve(["available": true, "platform": "ios", "buildMarker": "ios_plugin_scaffold_1"])
    #else
    call.resolve(["available": false, "platform": "other"])
    #endif
  }

  @objc public func isSupported(_ call: CAPPluginCall) {
    #if os(iOS)
    #if canImport(StripeTerminal)
    #if targetEnvironment(simulator)
    call.resolve(["supported": false, "platform": "ios", "unsupportedReason": "simulator_not_supported"])
    #else
    call.resolve(["supported": true, "platform": "ios"])
    #endif
    #else
    call.resolve(["supported": false, "platform": "ios", "unsupportedReason": "sdk_missing"])
    #endif
    #else
    call.resolve(["supported": false, "platform": "web"])
    #endif
  }

  @objc public func initialize(_ call: CAPPluginCall) {
    #if canImport(StripeTerminal)
    if initialized {
      call.resolve(["status": connectionStatus])
      return
    }
    self.connectionStatus = "initializing"
    emitDiag("initialize_started", phase: "initialize")
    class JsTokenProvider: NSObject, ConnectionTokenProvider {
      weak var plugin: ReplyflowStripeTerminalPlugin?
      init(plugin: ReplyflowStripeTerminalPlugin) { self.plugin = plugin }
      func fetchConnectionToken(_ completion: @escaping ConnectionTokenCompletionBlock) {
        let requestId = UUID().uuidString
        self.plugin?.pendingTokenRequests[requestId] = { result in
          switch result {
          case .success(let secret): completion(secret, nil)
          case .failure(let err): completion(nil, err)
          }
        }
        self.plugin?.notifyListeners("connectionTokenRequested", data: ["requestId": requestId])
      }
    }
    Terminal.setTokenProvider(JsTokenProvider(plugin: self))
    self.initialized = true
    self.connectionStatus = "ready"
    emitDiag("initialize_completed", phase: "initialize")
    call.resolve(["status": connectionStatus])
    #else
    call.reject("Stripe Terminal SDK not available")
    #endif
  }

  @objc public func requestConnectionToken(_ call: CAPPluginCall) {
    let requestId = UUID().uuidString
    pendingTokenRequests[requestId] = { result in }
    self.notifyListeners("connectionTokenRequested", data: ["requestId": requestId])
    call.resolve([:])
  }

  @objc public func supplyConnectionToken(_ call: CAPPluginCall) {
    guard let requestId = call.getString("requestId"), let secret = call.getString("secret") else {
      call.reject("missing parameters")
      return
    }
    if let cb = pendingTokenRequests.removeValue(forKey: requestId) {
      cb(.success(secret))
    }
    call.resolve()
  }

  @objc public func supplyConnectionTokenError(_ call: CAPPluginCall) {
    guard let requestId = call.getString("requestId") else {
      call.reject("missing parameters")
      return
    }
    let err = NSError(domain: "ReplyflowTerminal", code: -1, userInfo: [NSLocalizedDescriptionKey: call.getString("message") ?? "Unknown error"]) 
    if let cb = pendingTokenRequests.removeValue(forKey: requestId) {
      cb(.failure(err))
    }
    call.resolve()
  }

  @objc public func connectTapToPay(_ call: CAPPluginCall) {
    #if canImport(StripeTerminal)
    let simulated = call.getBool("simulated") ?? false
    let locationId = call.getString("locationId")
    let correlationId = call.getString("diagnosticAttemptId") ?? UUID().uuidString
    if self.connectionStatus == "connected" {
      emitDiag("connect_reader_completed", phase: "connect_reader", correlationId: correlationId)
      call.resolve(["status": self.connectionStatus])
      return
    }
    var claimed = false
    connectGuard.sync {
      if !self.connectInFlightNative { self.connectInFlightNative = true; claimed = true }
    }
    if !claimed {
      emitDiag("stale_discovery_update_ignored", phase: "connect_reader", correlationId: correlationId, meta: ["reason": "connect_inflight_native"])
      call.resolve(["status": self.connectionStatus])
      return
    }
    let opId = UUID().uuidString
    self.activeConnectOpId = opId
    emitDiag("connect_reader_started", phase: "connect_reader", correlationId: correlationId, meta: ["operationId": opId])
    self.connectionStatus = "connecting"
    self.notifyListeners("statusChanged", data: ["status": self.connectionStatus])
    #if targetEnvironment(simulator)
    self.connectionStatus = simulated ? "connected" : "error"
    if self.connectionStatus == "connected" {
      self.notifyListeners("readerConnected", data: ["connected": true])
      emitDiag("connect_reader_completed", phase: "connect_reader", correlationId: correlationId, meta: ["operationId": opId])
    } else {
      emitDiag("connect_reader_failed", phase: "connect_reader", correlationId: correlationId, meta: ["operationId": opId, "code": "simulator_not_supported"]) 
    }
    connectGuard.sync { self.connectInFlightNative = false; if self.activeConnectOpId == opId { self.activeConnectOpId = nil } }
    call.resolve(["status": self.connectionStatus])
    #else
    connectGuard.sync { self.connectInFlightNative = false; if self.activeConnectOpId == opId { self.activeConnectOpId = nil } }
    call.reject("not implemented")
    #endif
    #else
    call.reject("Stripe Terminal SDK not available")
    #endif
  }

  @objc public func collectPayment(_ call: CAPPluginCall) {
    call.reject("not implemented")
  }

  @objc public func confirmPaymentIntent(_ call: CAPPluginCall) {
    call.reject("not implemented")
  }

  @objc public func cancel(_ call: CAPPluginCall) {
    call.resolve(["status": self.connectionStatus])
  }

  @objc public func disconnect(_ call: CAPPluginCall) {
    self.connectionStatus = "ready"
    self.notifyListeners("statusChanged", data: ["status": self.connectionStatus])
    call.resolve(["status": self.connectionStatus])
  }

  @objc public func teardown(_ call: CAPPluginCall) {
    self.initialized = false
    self.connectionStatus = "not_initialized"
    call.resolve(["status": self.connectionStatus])
  }
}

extension ReplyflowStripeTerminalPlugin: CAPBridgedPlugin {
  public static let jsName = "ReplyflowStripeTerminal"
  public static let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "ping", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "initialize", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "requestConnectionToken", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "supplyConnectionToken", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "supplyConnectionTokenError", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "connectTapToPay", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "collectPayment", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "confirmPaymentIntent", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "disconnect", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "teardown", returnType: CAPPluginReturnPromise)
  ]
}
