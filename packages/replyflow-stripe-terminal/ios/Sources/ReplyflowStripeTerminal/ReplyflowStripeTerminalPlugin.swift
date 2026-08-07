import Foundation
import Capacitor

#if canImport(UIKit)
import UIKit
#endif

#if canImport(StripeTerminal)
import StripeTerminal
#endif

#if canImport(ProximityReader)
import ProximityReader
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
    CAPPluginMethod(name: "getTapToPaySupportStatus", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "getDiagnosticEnvironment", returnType: CAPPluginReturnPromise),
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
    CAPPluginMethod(name: "isTapToPayAccountLinked", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "presentMerchantEducation", returnType: CAPPluginReturnPromise)
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

  @objc public func getTapToPaySupportStatus(_ call: CAPPluginCall) {
    #if os(iOS)
    #if canImport(StripeTerminal)
    #if canImport(ProximityReader)
    #if targetEnvironment(simulator)
    call.resolve([
      "status": "unsupported_device",
      "supported": false,
      "platform": "ios",
      "unsupportedReason": "simulator_not_supported",
      "deviceInfo": [
        "isSimulator": true,
        "deviceModel": UIDevice.current.model
      ]
    ])
    #else
    // Check if device is iPhone (not iPad or iPod touch)
    let device = UIDevice.current
    let deviceModel = device.model.lowercased()
    
    // iPad and iPod touch do not support Tap to Pay
    if deviceModel.contains("ipad") || deviceModel.contains("ipod") {
      call.resolve([
        "status": "unsupported_device",
        "supported": false,
        "platform": "ios",
        "unsupportedReason": "unsupported_device_type",
        "deviceInfo": [
          "deviceModel": device.model,
          "deviceType": UIDevice.current.userInterfaceIdiom == .pad ? "ipad" : "other"
        ]
      ])
      return
    }
    
    // Check if device is iOS on Mac
    if ProcessInfo.processInfo.isiOSAppOnMac {
      call.resolve([
        "status": "unsupported_device",
        "supported": false,
        "platform": "ios",
        "unsupportedReason": "ios_on_mac_not_supported",
        "deviceInfo": [
          "isiOSAppOnMac": true
        ]
      ])
      return
    }
    
    // Check iOS version (Tap to Pay requires iOS 15.4+, Stripe Terminal SDK requires iOS 15.0+)
    if #available(iOS 15.4, *) {
      // Use Apple's native PaymentCardReader.isSupported API
      // This is the canonical hardware capability check
      if #available(iOS 16.0, *) {
        let isSupported = ProximityReader.PaymentCardReader.isSupported
        
        // Optional: include device identifier as diagnostics only (not source of truth)
        var systemInfo = utsname()
        uname(&systemInfo)
        let machineMirror = Mirror(reflecting: systemInfo.machine)
        let deviceIdentifier = machineMirror.children.reduce("") { identifier, element in
          guard let value = element.value as? Int8, value != 0 else { return identifier }
          return identifier + String(UnicodeScalar(UInt8(value)))
        }
        
        if isSupported {
          call.resolve([
            "status": "supported",
            "supported": true,
            "platform": "ios",
            "deviceInfo": [
              "deviceModel": device.model,
              "deviceIdentifier": deviceIdentifier,
              "systemVersion": device.systemVersion,
              "isiOSAppOnMac": false
            ]
          ])
        } else {
          call.resolve([
            "status": "unsupported_device",
            "supported": false,
            "platform": "ios",
            "unsupportedReason": "unsupported_device_type",
            "deviceInfo": [
              "deviceModel": device.model,
              "deviceIdentifier": deviceIdentifier,
              "systemVersion": device.systemVersion,
              "checkMethod": "PaymentCardReader.isSupported"
            ]
          ])
        }
      } else {
        // iOS 15.4-15.x: PaymentCardReader.isSupported is not available
        // Perform a safe Tap to Pay discovery to determine capability
        // This uses TapToPayDiscoveryConfigurationBuilder which is available in Stripe Terminal SDK 5.0.0+
        do {
          let discoveryConfig = try TapToPayDiscoveryConfigurationBuilder().setSimulated(false).build()
          let terminal = SCPTerminal.shared
          var discoverySupported = false
          let semaphore = DispatchSemaphore(value: 0)
          
          let discoveryCancelable = terminal.discoverReaders(discoveryConfig, delegate: self) { error in
            if error == nil {
              // Discovery started successfully - indicates Tap to Pay is supported
              discoverySupported = true
            }
            semaphore.signal()
          }
          
          // Wait for discovery to start or fail (with short timeout)
          let timeout = DispatchTime.now() + .seconds(2)
          let result = semaphore.wait(timeout: timeout)
          
          // Cancel discovery immediately after check
          discoveryCancelable?.cancel()
          
          if result == .success && discoverySupported {
            call.resolve([
              "status": "supported",
              "supported": true,
              "platform": "ios",
              "deviceInfo": [
                "deviceModel": device.model,
                "systemVersion": device.systemVersion,
                "checkMethod": "TapToPayDiscoveryConfigurationBuilder"
              ]
            ])
          } else {
            call.resolve([
              "status": "unsupported_device",
              "supported": false,
              "platform": "ios",
              "unsupportedReason": "unsupported_device_type",
              "deviceInfo": [
                "deviceModel": device.model,
                "systemVersion": device.systemVersion,
                "checkMethod": "TapToPayDiscoveryConfigurationBuilder"
              ]
            ])
          }
        } catch {
          // Stripe SDK error - likely indicates Tap to Pay is not supported
          call.resolve([
            "status": "unsupported_device",
            "supported": false,
            "platform": "ios",
            "unsupportedReason": "unsupported_device_type",
            "deviceInfo": [
              "deviceModel": device.model,
              "systemVersion": device.systemVersion,
              "checkMethod": "TapToPayDiscoveryConfigurationBuilder",
              "error": error.localizedDescription
            ]
          ])
        }
      }
    } else {
      call.resolve([
        "status": "unsupported_ios_version",
        "supported": false,
        "platform": "ios",
        "unsupportedReason": "ios_version_too_old",
        "deviceInfo": [
          "systemVersion": device.systemVersion,
          "requiredVersion": "15.4"
        ]
      ])
    }
    #endif
    #else
    // ProximityReader not available (iOS < 16.0 or missing framework)
    // Fall back to Stripe Terminal SDK check
    if #available(iOS 15.0, *) {
      if #available(iOS 15.4, *) {
        let device = UIDevice.current
        let deviceModel = device.model.lowercased()
        
        // iPad and iPod touch do not support Tap to Pay
        if deviceModel.contains("ipad") || deviceModel.contains("ipod") {
          call.resolve([
            "status": "unsupported_device",
            "supported": false,
            "platform": "ios",
            "unsupportedReason": "unsupported_device_type",
            "deviceInfo": [
              "deviceModel": device.model,
              "deviceType": UIDevice.current.userInterfaceIdiom == .pad ? "ipad" : "other"
            ]
          ])
          return
        }
        
        // Check if device is iOS on Mac
        if ProcessInfo.processInfo.isiOSAppOnMac {
          call.resolve([
            "status": "unsupported_device",
            "supported": false,
            "platform": "ios",
            "unsupportedReason": "ios_on_mac_not_supported",
            "deviceInfo": [
              "isiOSAppOnMac": true
            ]
          ])
          return
        }
        
        // Use TapToPayDiscoveryConfigurationBuilder to determine capability
        // This is the correct Stripe Terminal SDK 5.0.0+ API for Tap to Pay
        do {
          let discoveryConfig = try TapToPayDiscoveryConfigurationBuilder().setSimulated(false).build()
          let terminal = SCPTerminal.shared
          var discoverySupported = false
          let semaphore = DispatchSemaphore(value: 0)
          
          let discoveryCancelable = terminal.discoverReaders(discoveryConfig, delegate: self) { error in
            if error == nil {
              // Discovery started successfully - indicates Tap to Pay is supported
              discoverySupported = true
            }
            semaphore.signal()
          }
          
          // Wait for discovery to start or fail (with short timeout)
          let timeout = DispatchTime.now() + .seconds(2)
          let result = semaphore.wait(timeout: timeout)
          
          // Cancel discovery immediately after check
          discoveryCancelable?.cancel()
          
          if result == .success && discoverySupported {
            call.resolve([
              "status": "supported",
              "supported": true,
              "platform": "ios",
              "deviceInfo": [
                "deviceModel": device.model,
                "systemVersion": device.systemVersion,
                "checkMethod": "TapToPayDiscoveryConfigurationBuilder"
              ]
            ])
          } else {
            call.resolve([
              "status": "unsupported_device",
              "supported": false,
              "platform": "ios",
              "unsupportedReason": "unsupported_device_type",
              "deviceInfo": [
                "deviceModel": device.model,
                "systemVersion": device.systemVersion,
                "checkMethod": "TapToPayDiscoveryConfigurationBuilder"
              ]
            ])
          }
        } catch {
          // Stripe SDK error - likely indicates Tap to Pay is not supported
          call.resolve([
            "status": "unsupported_device",
            "supported": false,
            "platform": "ios",
            "unsupportedReason": "unsupported_device_type",
            "deviceInfo": [
              "deviceModel": device.model,
              "systemVersion": device.systemVersion,
              "checkMethod": "TapToPayDiscoveryConfigurationBuilder",
              "error": error.localizedDescription
            ]
          ])
        }
      } else {
        call.resolve([
          "status": "unsupported_ios_version",
          "supported": false,
          "platform": "ios",
          "unsupportedReason": "ios_version_too_old",
          "deviceInfo": [
            "systemVersion": device.systemVersion,
            "requiredVersion": "15.4"
          ]
        ])
      }
    } else {
      call.resolve([
        "status": "unsupported_ios_version",
        "supported": false,
        "platform": "ios",
        "unsupportedReason": "ios_version_too_old",
        "deviceInfo": [
          "systemVersion": device.systemVersion,
          "requiredVersion": "15.0"
        ]
      ])
    }
    #endif
    #else
    call.resolve([
      "status": "unavailable",
      "supported": false,
      "platform": "ios",
      "unsupportedReason": "sdk_missing"
    ])
    #endif
    #else
    call.resolve([
      "status": "unavailable",
      "supported": false,
      "platform": "web"
    ])
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
    if #available(iOS 16.4, *) {
      let onBehalfOf = call.getString("onBehalfOf")
      Task { @MainActor in
        do {
          let isLinked = try await Terminal.shared.isTapToPayAccountLinked(onBehalfOf)
          call.resolve(["isLinked": isLinked.boolValue])
        } catch {
          call.reject(error.localizedDescription)
        }
      }
    } else {
      call.reject("Tap to Pay account-link status requires iOS 16.4 or newer", "IOS_VERSION_UNSUPPORTED")
    }
    #else
    call.reject("Stripe Terminal SDK not available")
    #endif
  }

  @objc public func getDiagnosticEnvironment(_ call: CAPPluginCall) {
    #if DEBUG
    let isNativeDebugBuild = true
    let buildConfiguration = "DEBUG"
    #else
    let isNativeDebugBuild = false
    let buildConfiguration = "RELEASE"
    #endif

    #if os(iOS)
    let platform = "ios"
    #elseif os(Android)
    let platform = "android"
    #else
    let platform = "unknown"
    #endif

    let bundleIdentifier = Bundle.main.bundleIdentifier ?? "unknown"
    let appVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "unknown"
    let buildNumber = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "unknown"

    #if DEBUG
    let nativeBuildMarker = "ios_debug_\(Date().timeIntervalSince1970)"
    #else
    let nativeBuildMarker = "ios_release"
    #endif

    call.resolve([
      "isNativeDebugBuild": isNativeDebugBuild,
      "buildConfiguration": buildConfiguration,
      "nativeBuildMarker": nativeBuildMarker,
      "bundleIdentifier": bundleIdentifier,
      "appVersion": appVersion,
      "buildNumber": buildNumber,
      "platform": platform
    ])
  }

  @objc public func presentMerchantEducation(_ call: CAPPluginCall) {
    #if os(iOS)
    #if canImport(ProximityReader)
    if #available(iOS 18.0, *) {
      Task { @MainActor in
        do {
          let discovery = ProximityReaderDiscovery()
          let content = try await discovery.content(for: .payment(.howToTap))
          
          // Walk the presentedViewController chain to find the topmost view controller
          guard let rootViewController = self.bridge?.viewController else {
            call.reject("Unable to find root view controller")
            return
          }
          
          var topVC = rootViewController
          while let presented = topVC.presentedViewController {
            topVC = presented
          }
          
          // Apple's presentContent does not await dismissal
          // We present it and immediately return 'presented'
          // The caller must handle completion detection via UI confirmation
          discovery.presentContent(content, from: topVC)
          
          // Return presented but indicate completion status is unknown
          // The caller must show a confirmation step to verify user actually completed it
          call.resolve([
            "presented": true,
            "method": "native_ios18",
            "completionStatus": "presented_awaiting_confirmation",
            "requiresConfirmation": true
          ])
        } catch {
          call.reject("Failed to present merchant education: \(error.localizedDescription)")
        }
      }
    } else {
      // iOS < 18.0: Return that native education is not available
      call.resolve([
        "presented": false,
        "method": "fallback",
        "reason": "ios_version_too_old",
        "requiredVersion": "18.0"
      ])
    }
    #else
    // ProximityReader not available
    call.resolve([
      "presented": false,
      "method": "fallback",
      "reason": "proximity_reader_unavailable"
    ])
    #endif
    #else
    call.resolve([
      "presented": false,
      "method": "fallback",
      "reason": "platform_not_ios"
    ])
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
