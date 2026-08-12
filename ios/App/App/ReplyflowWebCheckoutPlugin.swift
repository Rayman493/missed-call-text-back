/**
 * ReplyflowWebCheckoutPlugin
 *
 * Production Capacitor plugin for native iOS Stripe checkout using ASWebAuthenticationSession.
 *
 * Purpose: Provide automatic return-to-app behavior for native iOS Stripe checkout
 * by using ASWebAuthenticationSession with HTTPS callback matching, which has been
 * physically proven to preserve Capacitor WKWebView Supabase/localStorage sessions.
 *
 * Security: This plugin only returns safe checkout metadata. No auth tokens,
 * cookies, or session contents are passed through native code.
 */

import Foundation
import Capacitor
import AuthenticationServices

@objc(ReplyflowWebCheckoutPlugin)
public class ReplyflowWebCheckoutPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ReplyflowWebCheckoutPlugin"
    public let jsName = "ReplyflowWebCheckoutPlugin"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "openCheckoutSession", returnType: CAPPluginReturnPromise)
    ]

    // Retain ASWebAuthenticationSession to prevent deallocation during checkout
    private var activeSession: ASWebAuthenticationSession?

    // Retain presentation context provider to prevent deallocation
    private var contextProvider: WebCheckoutPresentationContextProvider?

    // Guard against double promise resolution
    private var completionCalled = false

    #if DEBUG
    public override init() {
        super.init()
        print("[NATIVE CHECKOUT] plugin_class_loaded=true")
    }
    #endif

    @objc public func openCheckoutSession(_ call: CAPPluginCall) {
        // Reset completion guard
        completionCalled = false

        // Get parameters
        guard let checkoutUrl = call.getString("url") else {
            call.reject("Missing required parameter: url")
            return
        }

        let callbackHost = call.getString("callbackHost") ?? "www.replyflowhq.com"
        let callbackPath = call.getString("callbackPath") ?? "/billing/success"

        // Get iOS version
        let iosVersion = UIDevice.current.systemVersion
        let iosVersionDouble = Double(iosVersion) ?? 15.0

        // Log safe diagnostics
        print("[NATIVE CHECKOUT] session_started=true")
        print("[NATIVE CHECKOUT] iosVersion=\(iosVersion)")

        // Perform all UIKit-dependent setup on the main thread
        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                print("[NATIVE CHECKOUT] session_start_failed=true")
                call.reject("Plugin instance deallocated")
                return
            }

            // Diagnostics: check bridge view controller
            let bridgeVC = self.bridge?.viewController
            print("[NATIVE CHECKOUT] bridge_view_controller_present=\(bridgeVC != nil)")

            // Diagnostics: try to get window from bridge VC
            let bridgeWindow = bridgeVC?.view.window
            print("[NATIVE CHECKOUT] bridge_window_present=\(bridgeWindow != nil)")

            // Prefer foreground window from connected scenes if bridge window is nil
            var presentationWindow: UIWindow?

            if let bridgeWindow = bridgeWindow {
                presentationWindow = bridgeWindow
                print("[NATIVE CHECKOUT] using_bridge_window=true")
            } else {
                // Fallback to key window from connected scenes
                for scene in UIApplication.shared.connectedScenes {
                    if let windowScene = scene as? UIWindowScene, windowScene.activationState == .foregroundActive {
                        if let window = windowScene.windows.first {
                            presentationWindow = window
                            print("[NATIVE CHECKOUT] using_scene_window=true")
                            break
                        }
                    }
                }
            }

            print("[NATIVE CHECKOUT] captured_window_present=\(presentationWindow != nil)")

            guard let window = presentationWindow else {
                print("[NATIVE CHECKOUT] session_start_failed=true")
                print("[NATIVE CHECKOUT] presentation_on_main_thread=true")
                call.reject("Failed to get presentation window - no valid window found")
                return
            }

            print("[NATIVE CHECKOUT] presentation_on_main_thread=true")
            print("[NATIVE CHECKOUT] window_is_key=\(window.isKeyWindow)")

            // Create presentation context provider
            let provider = WebCheckoutPresentationContextProvider(window: window)
            self.contextProvider = provider
            print("[NATIVE CHECKOUT] provider_retained=true")

            // Create ASWebAuthenticationSession
            var session: ASWebAuthenticationSession?

            if #available(iOS 17.4, *) {
                // Use modern HTTPS callback matching for iOS 17.4+
                session = ASWebAuthenticationSession(
                    url: URL(string: checkoutUrl)!,
                    callback: .https(host: callbackHost, path: callbackPath)
                ) { [weak self] callbackURL, error in
                    self?.handleCompletion(callbackURL: callbackURL, error: error, iosVersion: iosVersion, call: call)
                }
            } else {
                // Fallback to custom scheme for iOS 15.0-17.3
                session = ASWebAuthenticationSession(
                    url: URL(string: checkoutUrl)!,
                    callbackURLScheme: "replyflow"
                ) { [weak self] callbackURL, error in
                    self?.handleCompletion(callbackURL: callbackURL, error: error, iosVersion: iosVersion, call: call)
                }
            }

            self.activeSession = session
            print("[NATIVE CHECKOUT] session_retained=true")

            guard let session = session else {
                print("[NATIVE CHECKOUT] session_creation_failed=true")
                call.reject("Failed to create ASWebAuthenticationSession")
                return
            }

            // Set presentation context provider
            session.presentationContextProvider = provider

            // Start the session and check return value
            do {
                let started = session.start()
                print("[NATIVE CHECKOUT] session_start_return=\(started)")

                if started {
                    print("[NATIVE CHECKOUT] session_presented=true")
                    // DO NOT resolve promise here - wait for callback
                    // The promise is resolved in handleCompletion when the callback fires
                } else {
                    print("[NATIVE CHECKOUT] session_start_failed=true")
                    // Clean up retained objects
                    self.activeSession = nil
                    self.contextProvider = nil
                    call.reject("ASWebAuthenticationSession.start() returned false")
                }
            } catch {
                print("[NATIVE CHECKOUT] session_start_failed=true")
                // Clean up retained objects
                self.activeSession = nil
                self.contextProvider = nil
                call.reject("Failed to start ASWebAuthenticationSession: \(error.localizedDescription)")
            }
        }
    }

    private func handleCompletion(callbackURL: URL?, error: Error?, iosVersion: String, call: CAPPluginCall) {
        // Idempotency guard - prevent double resolution
        guard !completionCalled else {
            return
        }
        completionCalled = true

        print("[NATIVE CHECKOUT] callback_received=true")
        print("[NATIVE CHECKOUT] session_dismissed=true")

        // Clear retained session to allow deallocation
        self.activeSession = nil
        self.contextProvider = nil

        var result: [String: Any] = [
            "iosVersion": iosVersion
        ]

        if let error = error {
            let nsError = error as NSError
            let isCanceled = nsError.code == ASWebAuthenticationSessionError.canceledLogin.rawValue
            let errorDomain = nsError.domain
            let errorCode = String(nsError.code)

            result["completed"] = false
            result["canceled"] = isCanceled
            result["errorCode"] = errorCode
            result["errorMessage"] = nsError.localizedDescription

            print("[NATIVE CHECKOUT] completion_error_domain=\(errorDomain)")
            print("[NATIVE CHECKOUT] completion_error_code=\(errorCode)")

            if isCanceled {
                print("[NATIVE CHECKOUT] user_canceled=true")
            } else {
                print("[NATIVE CHECKOUT] session_error=true")
            }
        } else {
            result["completed"] = true
        }

        if let callbackURL = callbackURL {
            result["callbackMatched"] = true
            result["callbackUrl"] = callbackURL.absoluteString
            print("[NATIVE CHECKOUT] callback_matched=true")
            print("[NATIVE CHECKOUT] completion_callback_url_present=true")
        } else {
            result["callbackMatched"] = false
            print("[NATIVE CHECKOUT] callback_matched=false")
            print("[NATIVE CHECKOUT] completion_callback_url_present=false")
        }

        call.resolve(result)
    }
}

// Dedicated presentation context provider to avoid UIViewController extension warning
// Captures the window on the main thread before the authentication session needs it
class WebCheckoutPresentationContextProvider: NSObject, ASWebAuthenticationPresentationContextProviding {
    private let window: ASPresentationAnchor

    init(window: ASPresentationAnchor) {
        self.window = window
        super.init()
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return window
    }
}