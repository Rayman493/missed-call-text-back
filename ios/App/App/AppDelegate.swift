import UIKit
import Capacitor
import WebKit
import ReplyflowStripeTerminal

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let bgColor = UIColor(red: 2.0/255.0, green: 6.0/255.0, blue: 23.0/255.0, alpha: 1.0)
        window?.backgroundColor = bgColor
        if let vc = window?.rootViewController as? CAPBridgeViewController {
            vc.view.backgroundColor = bgColor
            if let wv = vc.bridge?.webView {
                wv.isOpaque = true
                wv.backgroundColor = bgColor
                wv.scrollView.backgroundColor = bgColor
            }
        }
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate graphics rendering callbacks, and store enough application state information to restore your application to its current case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save any appropriate context.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}

// Custom bridge controller to set background colors after web view is loaded
class CustomBridgeViewController: CAPBridgeViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        let bgColor = UIColor(red: 2.0/255.0, green: 6.0/255.0, blue: 23.0/255.0, alpha: 1.0)
        view.backgroundColor = bgColor

        // Configure WebView background when available
        if let webView = bridge?.webView {
            webView.isOpaque = true
            webView.backgroundColor = bgColor
            webView.scrollView.backgroundColor = bgColor
        }
    }

    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(ReplyflowStripeTerminalPlugin())
        print("[ReplyflowStripeTerminal] plugin instance registration requested")
        // ReplyflowWebSessionDiagnosticsPlugin is auto-discovered by Capacitor 8 via CAPBridgedPlugin conformance
        print("[ReplyflowWebSessionDiagnostics] plugin auto-discovery via CAPBridgedPlugin")
    }
}