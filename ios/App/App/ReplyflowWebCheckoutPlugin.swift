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

    #if DEBUG
    public override init() {
        super.init()
        print("[NATIVE CHECKOUT] plugin_class_loaded=true")
    }
    #endif

    @objc public func openCheckoutSession(_ call: CAPPluginCall) {
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

        // Create ASWebAuthenticationSession - must be stored as property to prevent deallocation
        if #available(iOS 17.4, *) {
            // Use modern HTTPS callback matching for iOS 17.4+
            let session = ASWebAuthenticationSession(
                url: URL(string: checkoutUrl)!,
                callback: .https(host: callbackHost, path: callbackPath)
            ) { callbackURL, error in
                self.handleCompletion(callbackURL: callbackURL, error: error, iosVersion: iosVersion, call: call)
            }
            self.activeSession = session
        } else {
            // Fallback to custom scheme for iOS 15.0-17.3
            let session = ASWebAuthenticationSession(
                url: URL(string: checkoutUrl)!,
                callbackURLScheme: "replyflow"
            ) { callbackURL, error in
                self.handleCompletion(callbackURL: callbackURL, error: error, iosVersion: iosVersion, call: call)
            }
            self.activeSession = session
        }

        // Set presentation context provider
        if let session = self.activeSession {
            let contextProvider = WebCheckoutPresentationContextProvider(viewController: self.bridge?.viewController)
            session.presentationContextProvider = contextProvider

            do {
                try session.start()
                print("[NATIVE CHECKOUT] session_presented=true")
                // DO NOT resolve promise here - wait for callback
                // The promise is resolved in handleCompletion when the callback fires
            } catch {
                print("[NATIVE CHECKOUT] session_start_failed=true")
                call.reject("Failed to start ASWebAuthenticationSession: \(error.localizedDescription)")
            }
        } else {
            print("[NATIVE CHECKOUT] session_creation_failed=true")
            call.reject("Failed to create ASWebAuthenticationSession")
        }
    }

    private func handleCompletion(callbackURL: URL?, error: Error?, iosVersion: String, call: CAPPluginCall) {
        print("[NATIVE CHECKOUT] callback_received=true")
        print("[NATIVE CHECKOUT] session_dismissed=true")

        // Clear retained session to allow deallocation
        self.activeSession = nil

        var result: [String: Any] = [
            "completed": true,
            "iosVersion": iosVersion
        ]

        if let error = error {
            let nsError = error as NSError
            let isCanceled = nsError.code == ASWebAuthenticationSessionError.canceledLogin.rawValue
            result["canceled"] = isCanceled
            result["errorCode"] = String(nsError.code)
            result["errorMessage"] = nsError.localizedDescription

            if isCanceled {
                print("[NATIVE CHECKOUT] user_canceled=true")
            } else {
                print("[NATIVE CHECKOUT] session_error=true")
            }
        }

        if let callbackURL = callbackURL {
            result["callbackMatched"] = true
            result["callbackUrl"] = callbackURL.absoluteString
            print("[NATIVE CHECKOUT] callback_matched=true")
        } else {
            result["callbackMatched"] = false
            print("[NATIVE CHECKOUT] callback_matched=false")
        }

        call.resolve(result)
    }
}

// Dedicated presentation context provider to avoid UIViewController extension warning
class WebCheckoutPresentationContextProvider: NSObject, ASWebAuthenticationPresentationContextProviding {
    private weak var viewController: UIViewController?

    init(viewController: UIViewController?) {
        self.viewController = viewController
        super.init()
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return viewController?.view.window ?? ASPresentationAnchor()
    }
}