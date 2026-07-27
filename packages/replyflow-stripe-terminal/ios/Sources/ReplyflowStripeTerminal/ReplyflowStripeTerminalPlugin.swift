import Foundation
import Capacitor

#if canImport(UIKit)
import UIKit
#endif

#if canImport(StripeTerminal)
import StripeTerminal
#endif

@objc(ReplyflowStripeTerminalPlugin)
public class ReplyflowStripeTerminalPlugin: CAPPlugin, CAPBridgedPlugin {
  private let eventNameDiagnostics = "tpDiagnostics"
  #if DEBUG
  public override init() {
    super.init()
    print("[ReplyflowStripeTerminal] plugin loaded")
  }
  #endif
  public let identifier = "ReplyflowStripeTerminalPlugin"
  public let jsName = "ReplyflowStripeTerminal"
  public let pluginMethods: [CAPPluginMethod] = [
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
    CAPPluginMethod(name: "teardown", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "isTapToPayAccountLinked", returnType: CAPPluginReturnPromise)
  ]

  private var initialized = false
  private var connectionStatus: String = "not_initialized"

  private let connectGuard = DispatchQueue(label: "com.replyflowhq.terminal.connectGuard")
  private var connectInFlightNative = false
  private var activeConnectOpId: String? = nil

  private var pendingTokenRequests: [String: (Result<String, Error>) -> Void] = [:]
  #if canImport(StripeTerminal)
  private var tokenProvider: ConnectionTokenProvider?
  private var discoveryCancelable: Cancelable? = nil
  private var collectCancelable: Cancelable? = nil
  private var pendingConnectCall: (call: CAPPluginCall, opId: String, correlationId: String, locationId: String?)? = nil
  #endif

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
    #if DEBUG
    print("[ReplyflowStripeTerminal] ping reached")
    #endif
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
      let providerId = UUID().uuidString
      var requestCount = 0
      init(plugin: ReplyflowStripeTerminalPlugin) { self.plugin = plugin }
      func fetchConnectionToken(_ completion: @escaping ConnectionTokenCompletionBlock) {
        requestCount += 1
        let requestId = UUID().uuidString
        let requestNum = requestCount
        #if DEBUG
        print("[StripeTokenProvider] providerId=\(providerId) requestNum=\(requestNum) requestId=\(requestId) pendingCount=\(self.plugin?.pendingTokenRequests.count ?? 0)")
        #endif
        self.plugin?.pendingTokenRequests[requestId] = { result in
          #if DEBUG
          print("[StripeTokenProvider] completion_invoked providerId=\(self.providerId) requestNum=\(requestNum) requestId=\(requestId) result=\(result)")
          #endif
          switch result {
          case .success(let secret): completion(secret, nil)
          case .failure(let err): completion(nil, err)
          }
        }
        self.plugin?.emitDiag("token_provider_fetch_started", phase: "token", meta: ["providerId": providerId, "requestNum": String(requestNum), "requestId": requestId, "pendingCount": String(self.plugin?.pendingTokenRequests.count ?? 0)])
        self.plugin?.notifyListeners("connectionTokenRequested", data: ["requestId": requestId])
      }
    }
    let provider = JsTokenProvider(plugin: self)
    self.tokenProvider = provider
    Terminal.initWithTokenProvider(provider)
    Terminal.shared.delegate = self
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
    #if DEBUG
    print("[StripeTokenProvider] supplyConnectionToken requestId=\(requestId) pendingCount=\(pendingTokenRequests.count) hasCallback=\(pendingTokenRequests[requestId] != nil)")
    #endif
    if let cb = pendingTokenRequests.removeValue(forKey: requestId) {
      emitDiag("token_provider_supplied", phase: "token", meta: ["requestId": requestId, "pendingCount": String(pendingTokenRequests.count)])
      cb(.success(secret))
    } else {
      emitDiag("token_provider_no_matching_callback", phase: "token", meta: ["requestId": requestId, "pendingCount": String(pendingTokenRequests.count)])
      #if DEBUG
      print("[StripeTokenProvider] WARNING: No callback found for requestId=\(requestId)")
      #endif
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
    if let r = Terminal.shared.connectedReader {
      self.connectionStatus = "connected"
      self.notifyListeners("statusChanged", data: ["status": self.connectionStatus])
      self.notifyListeners("readerConnected", data: ["connected": true, "readerId": r.serialNumber ?? "reader"]) 
      emitDiag("connect_reader_completed", phase: "connect_reader", correlationId: correlationId, meta: ["reused": true, "readerId": r.serialNumber ?? "reader"]) 
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
    do {
      let discoveryConfig = try TapToPayDiscoveryConfigurationBuilder().setSimulated(simulated).build()
      self.emitDiag("discover_readers_started", phase: "discover_readers", correlationId: correlationId, meta: ["simulated": simulated])
      self.pendingConnectCall = (call, opId, correlationId, locationId)
      self.discoveryCancelable = Terminal.shared.discoverReaders(discoveryConfig, delegate: self) { error in
        if let e = error {
          // Suppress error when discovery completion reports a cancellation during
          // the intentional handoff to connectReader. Treat as benign so the
          // ongoing connect flow can proceed to resolution.
          var handoffActive = false
          self.connectGuard.sync { handoffActive = self.connectInFlightNative || (self.activeConnectOpId != nil) }
          let nsErr = e as NSError
          let isCanceledCode = (nsErr.code == ErrorCode.canceled.rawValue)
          let isCanceledMsg = e.localizedDescription.lowercased().contains("cancel")
          if handoffActive && (isCanceledCode || isCanceledMsg) {
            var meta: [String: Any] = ["message": e.localizedDescription]
            if let op = self.activeConnectOpId { meta["operationId"] = op }
            self.emitDiag("discover_readers_canceled_intentional", phase: "discover_readers", correlationId: correlationId, meta: meta)
            return
          }

          // Genuine discovery failure path - propagate to JS and clear flags
          self.emitDiag("discover_readers_failed", phase: "discover_readers", correlationId: correlationId, meta: ["message": e.localizedDescription])
          self.connectGuard.sync { self.connectInFlightNative = false; if self.activeConnectOpId == opId { self.activeConnectOpId = nil } }
          call.reject(e.localizedDescription)
        } else {
          self.emitDiag("discover_readers_completed", phase: "discover_readers", correlationId: correlationId, meta: nil)
        }
      }
    } catch {
      self.emitDiag("discover_readers_builder_failed", phase: "discover_readers", correlationId: correlationId, meta: ["message": error.localizedDescription])
      self.connectGuard.sync { self.connectInFlightNative = false; if self.activeConnectOpId == opId { self.activeConnectOpId = nil } }
      call.reject(error.localizedDescription)
    }
    #endif
    #else
    call.reject("Stripe Terminal SDK not available")
    #endif
  }

  @objc public func collectPayment(_ call: CAPPluginCall) {
    #if canImport(StripeTerminal)
    guard let clientSecret = call.getString("clientSecret") else { call.reject("missing clientSecret"); return }
    let attemptId = call.getString("terminalAttemptId")
    // Focused diagnostics
    self.emitDiag("PAYMENT_INTENT_RETRIEVE_STARTED", phase: "collect_payment", correlationId: attemptId, meta: nil)
    self.emitDiag("retrieve_payment_intent_started", phase: "collect_payment", correlationId: attemptId, meta: ["clientSecret": true])
    Task { @MainActor in
      do {
        let paymentIntent = try await Terminal.shared.retrievePaymentIntent(clientSecret: clientSecret)
        let piSuffix = paymentIntent.stripeId.map { String($0.suffix(6)) } ?? "unknown"
        let statusStr = String(describing: paymentIntent.status)
        let pmPresent = (paymentIntent.paymentMethod != nil)
        self.emitDiag("PAYMENT_INTENT_RETRIEVED", phase: "collect_payment", correlationId: attemptId, meta: ["piSuffix": piSuffix, "status": statusStr, "paymentMethodPresent": pmPresent])
        self.emitDiag("retrieve_payment_intent_completed", phase: "collect_payment", correlationId: attemptId, meta: ["paymentIntentId": paymentIntent.stripeId])
        self.notifyListeners("paymentStatusChanged", data: ["status": "collecting"]) 
        self.emitDiag("COLLECTION_STARTED", phase: "collect_payment", correlationId: attemptId, meta: ["piSuffix": piSuffix, "preCollectionStatus": statusStr])
        self.collectCancelable = Terminal.shared.collectPaymentMethod(paymentIntent) { collectedIntent, err in
          if let e2 = err {
            if (e2 as NSError).code == ErrorCode.canceled.rawValue {
              self.emitDiag("COLLECTION_CALLBACK", phase: "collect_payment", correlationId: attemptId, meta: ["success": false, "status": "canceled"]) 
              self.emitDiag("collect_payment_method_failed", phase: "collect_payment", correlationId: attemptId, meta: ["code": "canceled"]) 
              call.resolve(["status": "canceled"]) 
              self.emitDiag("CAPACITOR_PAYMENT_CALL_RESOLVED", phase: "collect_payment", correlationId: attemptId, meta: ["finalStatus": "canceled"]) 
              return
            }
            self.emitDiag("COLLECTION_CALLBACK", phase: "collect_payment", correlationId: attemptId, meta: ["success": false, "errorMessage": e2.localizedDescription])
            self.emitDiag("collect_payment_method_failed", phase: "collect_payment", correlationId: attemptId, meta: ["message": e2.localizedDescription])
            call.reject(e2.localizedDescription)
            self.emitDiag("CAPACITOR_PAYMENT_CALL_REJECTED", phase: "collect_payment", correlationId: attemptId, meta: ["stage": "collect", "message": e2.localizedDescription])
            return
          }
          guard let collectedPaymentIntent = collectedIntent else {
            self.emitDiag("COLLECTION_CALLBACK", phase: "collect_payment", correlationId: attemptId, meta: ["success": false, "errorMessage": "no_collected_payment_intent"]) 
            call.reject("no_collected_payment_intent")
            self.emitDiag("CAPACITOR_PAYMENT_CALL_REJECTED", phase: "collect_payment", correlationId: attemptId, meta: ["stage": "collect", "message": "no_collected_payment_intent"]) 
            return
          }
          let collectedSuffix = collectedPaymentIntent.stripeId.map { String($0.suffix(6)) } ?? "unknown"
          let collectedStatus = String(describing: collectedPaymentIntent.status)
          let collectedPm = (collectedPaymentIntent.paymentMethod != nil)
          self.emitDiag("COLLECTION_CALLBACK", phase: "collect_payment", correlationId: attemptId, meta: ["success": true, "status": collectedStatus, "paymentMethodPresent": collectedPm, "piSuffix": collectedSuffix])
          self.emitDiag("collect_payment_method_completed", phase: "collect_payment", correlationId: attemptId, meta: ["paymentIntentId": collectedPaymentIntent.stripeId])
          Task { @MainActor in
            do {
              self.emitDiag("PROCESS_PAYMENT_STARTED", phase: "confirm_payment", correlationId: attemptId, meta: ["piSuffix": collectedSuffix, "status": collectedStatus, "paymentMethodPresent": collectedPm])
              let processedIntent = try await Terminal.shared.confirmPaymentIntent(collectedPaymentIntent)
              let finalSuffix = processedIntent.stripeId.map { String($0.suffix(6)) } ?? "unknown"
              let finalStatus = String(describing: processedIntent.status)
              self.emitDiag("PROCESS_PAYMENT_CALLBACK", phase: "confirm_payment", correlationId: attemptId, meta: ["success": true, "finalStatus": finalStatus, "piSuffix": finalSuffix])
              self.emitDiag("confirm_payment_intent_completed", phase: "confirm_payment", correlationId: attemptId, meta: ["paymentIntentId": processedIntent.stripeId])
              self.notifyListeners("paymentSucceeded", data: ["paymentIntentId": processedIntent.stripeId])
              call.resolve(["status": "succeeded", "paymentIntentId": processedIntent.stripeId])
              self.emitDiag("CAPACITOR_PAYMENT_CALL_RESOLVED", phase: "confirm_payment", correlationId: attemptId, meta: ["finalStatus": "succeeded"]) 
            } catch {
              self.emitDiag("PROCESS_PAYMENT_CALLBACK", phase: "confirm_payment", correlationId: attemptId, meta: ["success": false, "errorMessage": error.localizedDescription])
              self.emitDiag("confirm_payment_intent_failed", phase: "confirm_payment", correlationId: attemptId, meta: ["message": error.localizedDescription])
              call.reject(error.localizedDescription)
              self.emitDiag("CAPACITOR_PAYMENT_CALL_REJECTED", phase: "confirm_payment", correlationId: attemptId, meta: ["stage": "confirm", "message": error.localizedDescription])
            }
          }
        }
      } catch {
        self.emitDiag("retrieve_payment_intent_failed", phase: "collect_payment", correlationId: attemptId, meta: ["message": error.localizedDescription])
        call.reject(error.localizedDescription)
        self.emitDiag("CAPACITOR_PAYMENT_CALL_REJECTED", phase: "collect_payment", correlationId: attemptId, meta: ["stage": "retrieve", "message": error.localizedDescription])
      }
    }
    #else
    call.reject("Stripe Terminal SDK not available")
    #endif
  }

  @objc public func confirmPaymentIntent(_ call: CAPPluginCall) {
    call.reject("not implemented")
  }

  @objc public func cancel(_ call: CAPPluginCall) {
    #if canImport(StripeTerminal)
    Task { @MainActor in
      do {
        if let c = collectCancelable {
          try await c.cancel()
        }
        call.resolve(["status": self.connectionStatus])
      } catch {
        call.reject(error.localizedDescription)
      }
    }
    #else
    call.resolve(["status": self.connectionStatus])
    #endif
  }

  @objc public func disconnect(_ call: CAPPluginCall) {
    #if canImport(StripeTerminal)
    Task { @MainActor in
      if Terminal.shared.connectedReader != nil {
        do {
          try await Terminal.shared.disconnectReader()
        } catch {
          // Ignore disconnect errors to preserve prior behavior
        }
      }
      self.connectionStatus = "ready"
      self.notifyListeners("statusChanged", data: ["status": self.connectionStatus])
      call.resolve(["status": self.connectionStatus])
    }
    #else
    self.connectionStatus = "ready"
    self.notifyListeners("statusChanged", data: ["status": self.connectionStatus])
    call.resolve(["status": self.connectionStatus])
    #endif
  }

  @objc public func teardown(_ call: CAPPluginCall) {
    self.initialized = false
    self.connectionStatus = "not_initialized"
    call.resolve(["status": self.connectionStatus])
  }

  @objc public func isTapToPayAccountLinked(_ call: CAPPluginCall) {
    #if canImport(StripeTerminal)
    let onBehalfOf = call.getString("onBehalfOf")
    Task { @MainActor in
      do {
        let isLinked = try await Terminal.shared.isTapToPayAccountLinked(onBehalfOf)
        call.resolve(["isLinked": isLinked.boolValue])
      } catch {
        call.reject(error.localizedDescription)
      }
    }
    #else
    call.reject("Stripe Terminal SDK not available")
    #endif
  }
}

 

#if canImport(StripeTerminal)
extension ReplyflowStripeTerminalPlugin: TerminalDelegate, DiscoveryDelegate, ReaderDelegate, TapToPayReaderDelegate {
  public func terminal(_ terminal: Terminal, didChangeConnectionStatus status: ConnectionStatus) {
    let s: String
    switch status {
    case .notConnected: s = "ready"
    case .connecting: s = "connecting"
    case .connected: s = "connected"
    @unknown default: s = "ready"
    }
    let prev = self.connectionStatus
    self.connectionStatus = s
    self.notifyListeners("statusChanged", data: ["status": s])
    self.emitDiag("connection_status_changed", phase: "connection_status", correlationId: nil, meta: ["previous": prev, "next": s])
  }

  public func terminal(_ terminal: Terminal, didChangePaymentStatus status: PaymentStatus) {
    let s: String
    switch status {
    case .notReady: s = "idle"
    case .ready: s = "ready"
    case .processing: s = "processing"
    @unknown default: s = "idle"
    }
    self.notifyListeners("paymentStatusChanged", data: ["status": s])
    self.emitDiag("payment_status_changed", phase: "collect_payment", correlationId: nil, meta: ["status": s])
  }

  public func terminal(_ terminal: Terminal, didUpdateDiscoveredReaders readers: [Reader]) {
    guard !readers.isEmpty else { return }
    guard let (call, opId, correlationId, locationId) = self.pendingConnectCall else { return }
    var proceed = false
    self.connectGuard.sync { if self.activeConnectOpId == opId { proceed = true } }
    if !proceed {
      self.emitDiag("stale_discovery_update_ignored", phase: "connect_reader", correlationId: correlationId, meta: ["reason": "operation_mismatch"])
      return
    }
    let reader = readers[0]
    if let dc = self.discoveryCancelable {
      Task { @MainActor in
        _ = try? await dc.cancel()
      }
    }
    let localLocationId = locationId ?? ""
    Task { @MainActor in
      do {
        let cfg = try TapToPayConnectionConfigurationBuilder(
          delegate: self,
          locationId: localLocationId
        ).build()
        let connectedReader = try await Terminal.shared.connectReader(reader, connectionConfig: cfg)
        var stale = false
        self.connectGuard.sync { stale = (self.activeConnectOpId != opId) }
        if stale {
          self.emitDiag("stale_connect_callback_ignored", phase: "connect_reader", correlationId: correlationId, meta: ["operationId": opId])
          return
        }
        self.connectionStatus = "connected"
        self.notifyListeners("statusChanged", data: ["status": self.connectionStatus])
        self.notifyListeners("readerConnected", data: ["connected": true, "readerId": connectedReader.serialNumber ?? "reader"]) 
        self.emitDiag("connect_reader_completed", phase: "connect_reader", correlationId: correlationId, meta: ["operationId": opId, "readerId": connectedReader.serialNumber ?? "reader"]) 
        self.connectGuard.sync { self.connectInFlightNative = false; if self.activeConnectOpId == opId { self.activeConnectOpId = nil } }
        call.resolve(["status": self.connectionStatus])
      } catch {
        var stale = false
        self.connectGuard.sync { stale = (self.activeConnectOpId != opId) }
        if stale {
          self.emitDiag("stale_connect_callback_ignored", phase: "connect_reader", correlationId: correlationId, meta: ["operationId": opId, "message": error.localizedDescription])
          return
        }
        if (error as NSError).code == ErrorCode.alreadyConnectedToReader.rawValue, Terminal.shared.connectedReader != nil {
          self.emitDiag("connect_already_connected_treated_success", phase: "connect_reader", correlationId: correlationId, meta: ["operationId": opId])
          self.connectGuard.sync { self.connectInFlightNative = false; if self.activeConnectOpId == opId { self.activeConnectOpId = nil } }
          call.resolve(["status": "connected"])
          return
        }
        self.emitDiag("connect_reader_failed", phase: "connect_reader", correlationId: correlationId, meta: ["operationId": opId, "message": error.localizedDescription])
        self.connectGuard.sync { self.connectInFlightNative = false; if self.activeConnectOpId == opId { self.activeConnectOpId = nil } }
        call.reject(error.localizedDescription)
      }
    }
  }

  public func reader(_ reader: Reader, didReportAvailableUpdate update: ReaderSoftwareUpdate) {}
  public func reader(_ reader: Reader, didStartInstallingUpdate update: ReaderSoftwareUpdate, cancelable: Cancelable?) {}
  public func reader(_ reader: Reader, didReportReaderSoftwareUpdateProgress progress: Float) {}
  public func reader(_ reader: Reader, didFinishInstallingUpdate update: ReaderSoftwareUpdate?, error: Error?) {}
  public func reader(_ reader: Reader, didRequestDisplayMessage displayMessage: ReaderDisplayMessage) {}
  public func reader(_ reader: Reader, didRequestReaderInput inputOptions: ReaderInputOptions = []) {}
  public func tapToPayReader(
    _ reader: Reader,
    didRequestReaderInput inputOptions: ReaderInputOptions = []
  ) {}
  public func tapToPayReader(
    _ reader: Reader,
    didRequestReaderDisplayMessage displayMessage: ReaderDisplayMessage
  ) {}
  public func tapToPayReader(_ reader: Reader, didStartInstallingUpdate update: ReaderSoftwareUpdate, cancelable: Cancelable?) {}
  public func tapToPayReader(_ reader: Reader, didReportReaderSoftwareUpdateProgress progress: Float) {}
  public func tapToPayReader(_ reader: Reader, didFinishInstallingUpdate update: ReaderSoftwareUpdate?, error: Error?) {}
}
#endif
