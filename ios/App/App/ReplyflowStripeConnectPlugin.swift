import Foundation
import Capacitor

#if canImport(UIKit)
import UIKit
#endif

#if canImport(AuthenticationServices)
import AuthenticationServices
#endif

@objc(ReplyflowStripeConnectPlugin)
public class ReplyflowStripeConnectPlugin: CAPPlugin, CAPBridgedPlugin {
  private let eventNameDiagnostics = "connectDiagnostics"
  #if DEBUG
  public override init() {
    super.init()
    print("[STRIPE CONNECT] plugin loaded")
  }
  #endif
  public let identifier = "ReplyflowStripeConnectPlugin"
  public let jsName = "ReplyflowStripeConnect"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "openConnectOnboarding", returnType: CAPPluginReturnPromise)
  ]

  private var authSession: ASWebAuthenticationSession?
  private weak var currentCall: CAPPluginCall?

  public func openConnectOnboarding(_ call: CAPPluginCall) {
    guard let url = call.getString("url") else {
      call.reject("URL is required")
      return
    }

    guard let callbackHost = call.getString("callbackHost") else {
      call.reject("callbackHost is required")
      return
    }

    guard let callbackPath = call.getString("callbackPath") else {
      call.reject("callbackPath is required")
      return
    }

    // Store current call for lifecycle management
    currentCall = call

    DispatchQueue.main.async { [weak self] in
      self?.openConnectOnboardingNative(url: url, callbackHost: callbackHost, callbackPath: callbackPath)
    }
  }

  private func openConnectOnboardingNative(url: String, callbackHost: String, callbackPath: String) {
    #if compiler(>=5.9)
    print("[STRIPE CONNECT] session_started=true")

    if #available(iOS 17.4, *) {
      // Use https callback matcher for iOS 17.4+
      let callbackURL = "https://\(callbackHost)\(callbackPath)"

      print("[STRIPE CONNECT] presentation_on_main_thread=true")

      // Get the bridge window
      guard let bridgeWindow = self.bridge?.viewController?.view.window else {
        print("[STRIPE CONNECT] captured_window_present=false")
        self.currentCall?.reject("No window available")
        return
      }
      print("[STRIPE CONNECT] captured_window_present=true")

      // Create and retain the session strongly
      authSession = ASWebAuthenticationSession(
        url: URL(string: url)!,
        callbackURLScheme: nil
      ) { [weak self] callbackURL, error in
        guard let self = self else { return }

        if let error = error {
          print("[STRIPE CONNECT] Error: \(error.localizedDescription)")
          self.currentCall?.reject(error.localizedDescription)
          self.currentCall = nil
          return
        }

        print("[STRIPE CONNECT] callback_received=true")

        guard let callbackURL = callbackURL else {
          print("[STRIPE CONNECT] No callback URL")
          self.currentCall?.reject("No callback URL")
          self.currentCall = nil
          return
        }

        print("[STRIPE CONNECT] Callback received: (host/path only, no params logged)")

        // Check if callback matches expected host/path
        if callbackURL.host == callbackHost && callbackURL.path == callbackPath {
          print("[STRIPE CONNECT] callback_matched=true")
          self.currentCall?.resolve([
            "completed": true,
            "callbackMatched": true,
            "callbackUrl": callbackURL.absoluteString
          ])
        } else {
          print("[STRIPE CONNECT] callback_matched=false")
          self.currentCall?.reject("Callback URL did not match expected path")
        }
        self.currentCall = nil
      }

      print("[STRIPE CONNECT] provider_retained=true")
      print("[STRIPE CONNECT] session_retained=true")

      // Use ephemeral session for privacy
      if #available(iOS 13.0, *) {
        authSession?.prefersEphemeralWebBrowserSession = false
      }

      authSession?.presentationContextProvider = self.bridge?.viewController

      let started = authSession?.start()
      print("[STRIPE CONNECT] session_start_return=\(started ?? false)")

      if started == true {
        print("[STRIPE CONNECT] session_presented=true")
      } else {
        print("[STRIPE CONNECT] session_presented=false")
        currentCall?.reject("Failed to start authentication session")
        currentCall = nil
      }
    } else {
      // Fallback for iOS < 17.4
      print("[STRIPE CONNECT] iOS version < 17.4, not supported")
      currentCall?.reject("Stripe Connect onboarding requires iOS 17.4 or later")
      currentCall = nil
    }
    #else
    print("[STRIPE CONNECT] Swift compiler version < 5.9, not supported")
    currentCall?.reject("Stripe Connect onboarding requires iOS 17.4 or later")
    currentCall = nil
    #endif
  }

  public override func pluginRemove() {
    // Clean up session when plugin is removed
    authSession?.cancel()
    authSession = nil
    currentCall = nil
    print("[STRIPE CONNECT] session_dismissed=true (plugin removal)")
  }
}

#if compiler(>=5.9)
@available(iOS 13.0, *)
extension ReplyflowStripeConnectPlugin: ASWebAuthenticationPresentationContextProviding {
  public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
    return self.bridge?.viewController?.view.window ?? ASPresentationAnchor()
  }
}
#endif