import UIKit
import Capacitor

/**
 * UIScene lifecycle delegate required by iPadOS 26+/27 enforcement of
 * UIApplicationSceneManifest (Apple rejects legacy app-lifecycle launches
 * on iPadOS 27 with EXC_BREAKPOINT during scene creation).
 *
 * The scene manifest still points at Main.storyboard, so the existing
 * CustomBridgeViewController and all plugin registration in
 * capacitorDidLoad() are unchanged.
 *
 * Deep links and Universal Links — which arrive on the scene under the
 * new lifecycle — are forwarded to ApplicationDelegateProxy so they emit
 * the same .capacitorOpenURL / .capacitorOpenUniversalLink notifications
 * the app delegate path produced. APNs callbacks stay on the app
 * delegate (they are application-scoped, not scene-scoped).
 */
class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        // Cold-start delivery: a deep link or universal link that launched
        // the app arrives in connectionOptions, not in later callbacks.
        for context in connectionOptions.urlContexts {
            forwardOpenURL(context.url, options: context.options)
        }
        for activity in connectionOptions.userActivities {
            _ = forwardUserActivity(activity)
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for context in URLContexts {
            forwardOpenURL(context.url, options: context.options)
        }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        _ = forwardUserActivity(userActivity)
    }

    // MARK: - Capacitor proxy forwarding

    @discardableResult
    private func forwardOpenURL(_ url: URL, options: UIScene.OpenURLOptions) -> Bool {
        var appOptions: [UIApplication.OpenURLOptionsKey: Any] = [:]
        if let source = options.sourceApplication {
            appOptions[.sourceApplication] = source
        }
        if let annotation = options.annotation {
            appOptions[.annotation] = annotation
        }
        appOptions[.openInPlace] = options.openInPlace
        return ApplicationDelegateProxy.shared.application(UIApplication.shared, open: url, options: appOptions)
    }

    @discardableResult
    private func forwardUserActivity(_ userActivity: NSUserActivity) -> Bool {
        return ApplicationDelegateProxy.shared.application(UIApplication.shared, continue: userActivity) { _ in }
    }
}
