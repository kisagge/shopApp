import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        enableBackSwipe()
        return true
    }

    /// 가장자리에서 밀어 뒤로 가기.
    ///
    /// **iOS 에서 이 동작이 아무 일도 안 했다.** 시뮬레이터에서 상품 상세를
    /// 열고 왼쪽 끝에서 밀어 봤는데 화면이 그대로였다. 안드로이드의 뒤로 가기
    /// 버튼은 웹 쪽 `native-back-button.tsx` 가 다루는데, iOS 의 대응물인
    /// 밀기 제스처는 WKWebView 설정이라 웹에서 손댈 수 없다.
    ///
    /// 빵부스러기로 돌아갈 수 있으니 막다른 길은 아니었다. 그래도 iOS 사용자가
    /// **반사적으로 하는 동작**이 반응하지 않는 것은 앱이 고장 난 것처럼 보인다.
    ///
    /// Capacitor 는 이 설정을 설정 파일로 열어 두지 않는다. 웹뷰를 만드는 자리는
    /// `CAPBridgeViewController` 안이고, 그것을 갈아 끼우려면 스토리보드와 Xcode
    /// 프로젝트 파일까지 손대야 한다. 대신 웹뷰가 화면에 올라온 뒤 켠다 —
    /// 이미 컴파일되는 이 파일만으로 끝난다.
    ///
    /// 알림에는 뷰컨트롤러가 실려 오지 않으므로(`Notification(name:)` 뿐)
    /// 루트에서 찾는다. 이 앱은 화면이 하나라 루트가 곧 그 화면이다.
    private func enableBackSwipe() {
        NotificationCenter.default.addObserver(
            forName: .capacitorViewDidAppear,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            let root = self?.window?.rootViewController as? CAPBridgeViewController
            root?.webView?.allowsBackForwardNavigationGestures = true
        }
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
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
