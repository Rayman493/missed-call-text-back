/**
 * ReplyflowWebSessionDiagnosticsPlugin
 *
 * Temporary Capacitor plugin for ASWebAuthenticationSession diagnostic testing.
 *
 * Purpose: Prove that Capacitor WKWebView Supabase/localStorage sessions
 * survive ASWebAuthenticationSession presentation and completion.
 *
 * Security: This plugin only returns safe diagnostic metadata. No auth tokens,
 * cookies, or session contents are passed through native code.
 */

import Foundation
import Capacitor
import AuthenticationServices

@objc(ReplyflowWebSessionDiagnosticsPlugin)
public class ReplyflowWebSessionDiagnosticsPlugin: CAPPlugin {

    @objc func testSessionPreservation(_ call: CAPPluginCall) {
        // Get iOS version
        let iosVersion = UIDevice.current.systemVersion
        let iosVersionDouble = Double(iosVersion) ?? 15.0

        // Base URL for test
        let startUrl = "https://www.replyflowhq.com/native-session-test/start"
        let callbackPath = "/native-session-test/callback"

        // Create ASWebAuthenticationSession
        var session: ASWebAuthenticationSession?

        if #available(iOS 17.4, *) {
            // Use modern HTTPS callback matching for iOS 17.4+
            session = ASWebAuthenticationSession(
                url: URL(string: startUrl)!,
                callback: .https(host: "www.replyflowhq.com", path: callbackPath)
            ) { callbackURL, error in
                self.handleCompletion(callbackURL: callbackURL, error: error, iosVersion: iosVersion, call: call)
            }
        } else {
            // Fallback to custom scheme for iOS 15.0-17.3
            session = ASWebAuthenticationSession(
                url: URL(string: startUrl)!,
                callbackURLScheme: "replyflow"
            ) { callbackURL, error in
                self.handleCompletion(callbackURL: callbackURL, error: error, iosVersion: iosVersion, call: call)
            }
        }

        // Set presentation context provider
        if let session = session {
            session.presentationContextProvider = self.bridge?.viewController
            session.start()

            call.resolve([
                "started": true,
                "iosVersion": iosVersion,
                "callbackMethod": iosVersionDouble >= 17.4 ? "https" : "customScheme"
            ])
        } else {
            call.reject("Failed to create ASWebAuthenticationSession")
        }
    }

    private func handleCompletion(callbackURL: URL?, error: Error?, iosVersion: String, call: CAPPluginCall) {
        var result: [String: Any] = [
            "completed": true,
            "iosVersion": iosVersion
        ]

        if let error = error {
            let nsError = error as NSError
            result["canceled"] = nsError.code == ASWebAuthenticationSessionError.canceledLogin.rawValue
            result["errorCode"] = String(nsError.code)
            result["errorMessage"] = nsError.localizedDescription
        }

        if let callbackURL = callbackURL {
            result["callbackMatched"] = true
            result["callbackUrl"] = callbackURL.absoluteString
        } else {
            result["callbackMatched"] = false
        }

        call.resolve(result)
    }
}

// Extension to provide presentation context for ASWebAuthenticationSession
extension UIViewController: ASWebAuthenticationPresentationContextProviding {
    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return self.view.window!
    }
}