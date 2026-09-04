# @shop/mobile — 네이티브 셸

배포된 웹앱을 웹뷰로 감싼 iOS·Android 껍데기다.

## 왜 감싸기만 하는가

정적으로 내보내 앱에 넣는 길도 있지만 이 앱은 그럴 수 없다. 목록·상품·주문
화면 대부분이 서버 컴포넌트와 API 라우트로 만들어지고 `force-dynamic` 이다.
내보낼 수 있는 것은 껍데기뿐이라 넣어 봐야 빈 화면이 된다.

그래서 셸이 하는 일은 셋뿐이다.

1. 웹뷰로 배포본을 띄운다 (`capacitor.config.ts` 의 `server.url`)
2. 쿠키가 날아가도 로그인이 유지되게 토큰을 저장한다 (`@shop/native`)
3. 네트워크가 없을 때 흰 화면 대신 무언가를 보여 준다 (`www/index.html`)

## 세션이 유지되는 방식

웹에서는 쿠키로 붙는다. 웹뷰는 쿠키를 잃을 수 있어서, 네이티브에서만
Better Auth 의 Bearer 토큰을 함께 쓴다.

- 로그인 응답의 `set-auth-token` 헤더를 `@shop/native` 가 저장한다
- 앱이 뜰 때 `NativeSession` 이 저장소에서 메모리로 올린다
- 요청마다 `Authorization: Bearer` 로 실어 보낸다
- 로그아웃(`signOutEverywhere`)은 서버 세션과 저장된 토큰을 **함께** 지운다

`@shop/native` 에는 **npm 의존성이 없다.** 셸이 웹뷰에 주입하는
`window.Capacitor` 를 직접 읽는다. `@capacitor/*` 를 웹 번들에 넣으면
브라우저로 들어온 사람에게까지 그 코드가 나가기 때문이다.

## 실행

```bash
pnpm mobile:sync                       # 설정·플러그인을 네이티브 프로젝트에 반영
pnpm mobile:ios                        # Xcode 열기
pnpm mobile:android                    # Android Studio 열기

CAP_SERVER_URL=http://192.168.0.10:3000 pnpm mobile:sync   # 내 컴퓨터를 보게
```

시뮬레이터는 `localhost` 로 호스트에 닿지만 실기기는 안 된다. 실기기로 볼
때는 같은 망의 IP 를 `CAP_SERVER_URL` 로 넘긴다. http 를 줄 때만 평문 로딩이
함께 켜진다 — 배포본은 https 로만 붙는다.

## 이 저장소에서 확인한 것과 못 한 것

- **iOS 빌드 성공** — `xcodebuild -sdk iphonesimulator -configuration Debug`.
  다만 이 컴퓨터에 **iOS 시뮬레이터 런타임이 없어 실행은 못 했다**
  (`xcrun simctl list runtimes` 에 watchOS 만 있다).
- **Android 빌드 실패** — `invalid source release: 21`. Capacitor 8 은 Java 21
  을 요구하는데 이 컴퓨터의 최신 JDK 는 19 다. JDK 21 을 깔면 풀린다.

두 가지 모두 코드 문제가 아니라 이 컴퓨터의 도구 문제다.

## 커밋하지 않는 것

`ios/`·`android/` 의 뼈대는 커밋한다(설정을 손으로 고칠 일이 있다). 다만
`cap sync` 가 매번 새로 만드는 것들 — 웹 자산 사본, Pods, Gradle 캐시 — 은
`.gitignore` 에 둔다.
