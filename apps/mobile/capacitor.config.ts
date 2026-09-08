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
    /**
     * 상태바 자리는 **웹이 혼자 맡는다.**
     *
     * 'always' 로 두면 네이티브가 웹뷰 자체를 상태바 아래로 밀어 놓는데,
     * 그 상태에서도 env(safe-area-inset-top) 은 여전히 상태바 높이를
     * 돌려준다. 헤더에 safe-t 를 붙이는 순간 같은 간격이 두 번 들어가
     * 위쪽에 빈 띠가 생겼다.
     *
     * 'never' 로 두고 viewport-fit=cover + env() 하나로 처리한다.
     * 안드로이드에는 contentInset 이 아예 없으니 이쪽이 양쪽이 같아진다.
     */
    contentInset: 'never',
  },

  android: {
    // 배포 빌드에서 웹뷰 디버거를 열어 두지 않는다
    webContentsDebuggingEnabled: false,
  },

  plugins: {
    /**
     * 시작 화면.
     *
     * **이 셸에는 특히 필요하다.** 앱 안에 화면이 들어 있는 것이 아니라
     * 배포된 웹앱을 네트워크로 받아 오므로, 켜고 나서 첫 화면이 그려지기까지
     * 웹보다 오래 걸린다. 그 사이를 비워 두면 흰 화면이고, 사용자는 앱이
     * 멈춘 줄 안다.
     *
     * **내리는 것은 웹이 한다.** 화면이 그려진 그 순간을 아는 것은 웹뿐이다
     * (@shop/native 의 hideSplash). 여기 적은 시간은 그 신호가 영영 안 올
     * 때를 대비한 **상한**이다 — 웹뷰가 아예 못 뜨는 상황에서 시작 화면이
     * 영원히 남는 것이 가장 나쁘다. autoHide 를 끄면 정확히 그렇게 된다.
     *
     * 돌아가는 동그라미는 두지 않는다. 이 앱이 기다리는 것은 한 번의
     * 화면 도착이라, 멈춰 있는 워드마크가 더 조용하다.
     */
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 6_000,
      launchFadeOutDuration: 200,
      showSpinner: false,
      // 웹앱의 밝은 배경과 같은 색. 이어지는 화면과 이음매가 안 보이게 한다.
      backgroundColor: '#fefdfc',
      androidScaleType: 'CENTER_CROP',
    },
  },
};

export default config;
