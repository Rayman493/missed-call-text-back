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
  private var contextProvider: StripeConnectPresentationContextProvider?

  @objc public func openConnectOnboarding(_ call: CAPPluginCall) {
    print("[STRIPE CONNECT] openConnectOnboarding_entered=true")

    // Cancel any existing session before starting a new one
    authSession?.cancel()
    authSession = nil
    contextProvider = nil

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

      // Diagnostics: check bridge view controller
      let bridgeVC = self.bridge?.viewController
      print("[STRIPE CONNECT] bridge_view_controller_present=\(bridgeVC != nil)")

      // Diagnostics: try to get window from bridge VC
      let bridgeWindow = bridgeVC?.view.window
      print("[STRIPE CONNECT] bridge_window_present=\(bridgeWindow != nil)")

      // Prefer foreground window from connected scenes if bridge window is nil
      var presentationWindow: UIWindow?

      if let bridgeWindow = bridgeWindow {
        presentationWindow = bridgeWindow
        print("[STRIPE CONNECT] using_bridge_window=true")
      } else {
        // Fallback to key window from connected scenes
        for scene in UIApplication.shared.connectedScenes {
          if let windowScene = scene as? UIWindowScene, windowScene.activationState == .foregroundActive {
            if let window = windowScene.windows.first {
              presentationWindow = window
              print("[STRIPE CONNECT] using_scene_window=true")
              break
            }
          }
        }
      }

      print("[STRIPE CONNECT] captured_window_present=\(presentationWindow != nil)")

      guard let window = presentationWindow else {
        print("[STRIPE CONNECT] session_start_failed=true")
        self.currentCall?.reject("Failed to get presentation window - no valid window found")
        return
      }

      print("[STRIPE CONNECT] presentation_on_main_thread=true")
      print("[STRIPE CONNECT] window_is_key=\(window.isKeyWindow)")

      // Create presentation context provider
      let provider = StripeConnectPresentationContextProvider(window: window)
      self.contextProvider = provider
      print("[STRIPE CONNECT] provider_retained=true")

      // Create and retain the session strongly
      authSession = ASWebAuthenticationSession(
        url: URL(string: url)!,
        callback: .https(host: callbackHost, path: callbackPath)
      ) { [weak self] callbackURL, error in
        guard let self = self else { return }

        if let error = error {
          print("[STRIPE CONNECT] completion_error_present=true")
          let nsError = error as NSError
          print("[STRIPE CONNECT] completion_error_code=\(nsError.code)")
          print("[STRIPE CONNECT] completion_error_domain=\(nsError.domain)")

          let isCanceled = nsError.code == ASWebAuthenticationSessionError.canceledLogin.rawValue
          print("[STRIPE CONNECT] user_canceled=\(isCanceled)")

          print("[STRIPE CONNECT] Error: \(error.localizedDescription)")
          // Clean up retained objects
          self.authSession = nil
          self.contextProvider = nil
          self.currentCall?.reject(error.localizedDescription)
          self.currentCall = nil
          return
        }

        print("[STRIPE CONNECT] callback_received=true")

        guard let callbackURL = callbackURL else {
          print("[STRIPE CONNECT] callback_url_present=false")
          print("[STRIPE CONNECT] No callback URL")
          // Clean up retained objects
          self.authSession = nil
          self.contextProvider = nil
          self.currentCall?.reject("No callback URL")
          self.currentCall = nil
          return
        }

        print("[STRIPE CONNECT] callback_url_present=true")
        print("[STRIPE CONNECT] Callback received: (host/path only, no params logged)")

        var result: [String: Any] = [:]

        // Check if callback matches expected host/path
        if callbackURL.host == callbackHost && callbackURL.path == callbackPath {
          print("[STRIPE CONNECT] callback_matched=true")
          result["completed"] = true
          result["callbackMatched"] = true
        } else {
          print("[STRIPE CONNECT] callback_matched=false")
          result["completed"] = false
          result["callbackMatched"] = false
        }
        print("[STRIPE CONNECT] session_dismissed=true")

        self.currentCall?.resolve(result)
        // Clean up retained objects
        self.authSession = nil
        self.contextProvider = nil
        self.currentCall = nil
      }

      print("[STRIPE CONNECT] session_retained=true")

      guard let session = authSession else {
        print("[STRIPE CONNECT] session_creation_failed=true")
        self.currentCall?.reject("Failed to create ASWebAuthenticationSession")
        return
      }

      // Set presentation context provider
      session.presentationContextProvider = provider

      // Start the session and check return value
      let started = session.start()
      print("[STRIPE CONNECT] session_start_return=\(started)")

      if started {
        print("[STRIPE CONNECT] session_presented=true")
      } else {
        print("[STRIPE CONNECT] session_presented=false")
        // Clean up retained objects
        self.authSession = nil
        self.contextProvider = nil
        self.currentCall?.reject("Failed to start authentication session")
        self.currentCall = nil
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
}

// Dedicated presentation context provider to avoid UIViewController extension warning
// Captures the window on the main thread before the authentication session needs it
class StripeConnectPresentationContextProvider: NSObject, ASWebAuthenticationPresentationContextProviding {
    private let window: ASPresentationAnchor

    init(window: ASPresentationAnchor) {
        self.window = window
        super.init()
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return window
    }
}