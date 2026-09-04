import type { CapacitorConfig } from '@capacitor/cli';

/**
 * 네이티브 셸 설정.
 *
 * **배포된 웹앱을 그대로 불러온다.** 정적으로 내보내 앱에 넣는 방법도 있지만
 * 이 앱은 그럴 수가 없다 — 서버 컴포넌트와 API 라우트가 화면 대부분을
 * 만들고, 모든 목록·주문 화면이 force-dynamic 이다. 내보낼 수 있는 것은
 * 껍데기뿐이라 넣어 봐야 빈 화면이 된다.
 *
 * 그래서 이 셸이 하는 일은 셋이다.
 * 1. 웹뷰로 배포본을 띄운다
 * 2. 쿠키가 날아가도 로그인이 유지되게 토큰을 저장한다 (@shop/native)
 * 3. 네트워크가 없을 때 빈 화면 대신 무언가를 보여 준다 (www/index.html)
 */

const PRODUCTION_URL = 'https://shop-app-web-tau.vercel.app';

/**
 * 개발 중에는 내 컴퓨터의 서버를 본다.
 *
 * 시뮬레이터는 localhost 로 호스트에 닿지만 실기기는 안 된다. 실기기로
 * 볼 때는 같은 망의 IP 를 넣는다 — CAP_SERVER_URL 로 넘기면 된다.
 */
const serverUrl = process.env['CAP_SERVER_URL'] ?? PRODUCTION_URL;

const config: CapacitorConfig = {
  appId: 'test.plain.shop',
  appName: 'PLAIN',
  // server.url 을 쓰더라도 Capacitor 는 webDir 을 요구한다.
  // 네트워크가 없을 때 이 안의 화면이 나온다.
  webDir: 'www',

  server: {
    url: serverUrl,
    /**
     * https 만 허용한다. 평문으로 열어 두면 중간에서 응답을 바꿔치기할 수
     * 있고, 웹뷰는 주소창이 없어 사용자가 알아챌 방법이 없다.
     * 개발용 http 는 CAP_SERVER_URL 을 줄 때만 함께 켠다.
     */
    cleartext: serverUrl.startsWith('http://'),
    androidScheme: 'https',
  },

  ios: {
    // 웹뷰가 스스로 스크롤하게 둔다. 네이티브가 같이 튕기면 두 번 움직인다.
    contentInset: 'always',
  },

  android: {
    // 배포 빌드에서 웹뷰 디버거를 열어 두지 않는다
    webContentsDebuggingEnabled: false,
  },
};

export default config;
