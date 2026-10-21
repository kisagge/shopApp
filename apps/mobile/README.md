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

## 구글 로그인

**웹뷰 안에서 구글 OAuth 를 열 수 없다.** 구글이 임베디드 웹뷰를 정책으로
막는다(`disallowed_useragent`). 그래서 계정 선택은 OS 가 띄우는 네이티브
화면(`@capgo/capacitor-social-login`)이 맡고, 거기서 받은 ID 토큰을
**웹뷰가** 서버로 보낸다 — 요청이 웹뷰에서 나가야 세션 토큰도 웹뷰로
돌아온다.

시스템 브라우저를 띄우고 딥링크로 되받는 방법도 있다. 그쪽은 브라우저와
웹뷰의 쿠키 저장소가 갈려서 세션을 따로 건네줘야 하고, 일회용 토큰과 인계
페이지와 URL 스킴이 줄줄이 붙는다. 이 구조에서는 그럴 이유가 없다.

검증은 서버가 한다. 앱이 받은 토큰은 그냥 문자열이고 뜯어 보지 않는다 —
클라이언트가 읽은 값으로 신원을 정하면 아무나 만들어 낼 수 있다.

구글 콘솔에는 클라이언트가 셋 필요하다.

| 유형 | 쓰이는 곳 |
|---|---|
| 웹 | 서버의 토큰 검증 기준. **안드로이드도 이 값을 쓴다** |
| Android | 코드에 넣지 않는다. 패키지명 + SHA-1 로 구글이 앱을 알아본다 |
| iOS | `Info.plist` 의 `GIDClientID` 와 역순 URL 스킴 |

iOS 는 클라이언트 ID 를 점 단위로 뒤집은 값을 URL 스킴으로 등록해야 계정
선택 화면에서 앱으로 돌아온다. 없으면 조용히 돌아오지 못한다.

Android 의 SHA-1 은 디버그 키스토어(`~/.android/debug.keystore`) 것이다.
스토어에 올릴 때는 릴리스 키스토어의 지문을 콘솔에 하나 더 등록해야 한다.

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

## 실행해서 확인한 것

**iOS** — iPhone 17 Pro 시뮬레이터(iOS 26.5)에서 빌드·설치·실행까지 됐다.
홈이 정상으로 그려지고 안전 영역도 지켜진다.

**Android** — Pixel 3a 에뮬레이터(API 34)에서 빌드·설치·실행까지 됐다.

Android 빌드에는 **JDK 21 이상**이 필요하다. Capacitor 8 이 `source release 21` 로
컴파일한다. 낮은 JDK 로는 여기서 멈춘다:

```
> Task :capacitor-android:compileDebugJavaWithJavac FAILED
error: invalid source release: 21
```

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21
```

**JDK 21 이 안 깔려 있어도 하나는 이미 있다.** Android Studio 가 JBR 을 들고 온다 —
이 글을 쓴 기계에는 21 이 없고 17·18·19 뿐이었는데, 번들 JBR(25)로 빌드·설치가 그대로
됐다. Gradle 8.14.3 + AGP 8.13 이 25 를 받는다.

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
cd apps/mobile/android && ./gradlew assembleDebug
adb -s <기기> install -r app/build/outputs/apk/debug/app-debug.apk
```

Gradle 에 절대 경로를 박지 않았다 — 사람마다 JDK 위치가 다르다. `local.properties`
(SDK 경로)는 Android Studio 가 만들고 커밋하지 않는다.

## 실행에서 찾은 것

시뮬레이터에서 로그인 입력을 누르니 **화면이 확대되고 그 상태로 남아**
헤더가 잘렸다. iOS 는 글자가 16px 미만인 입력에 포커스가 가면 자동으로
확대한다. 폼 컨트롤 글자를 손가락 기기에서만 16px 로 올려 고쳤다
(`packages/ui/src/styles/theme.css`). 뷰포트에 `maximum-scale=1` 을 박는 흔한
대처는 쓰지 않았다 — 손가락 확대까지 막아 저시력 사용자의 유일한 확대
수단을 없앤다.

## 커밋하지 않는 것

`ios/`·`android/` 의 뼈대는 커밋한다(설정을 손으로 고칠 일이 있다). 다만
`cap sync` 가 매번 새로 만드는 것들 — 웹 자산 사본, Pods, Gradle 캐시 — 은
`.gitignore` 에 둔다.

## 세션 토큰은 안전 저장소에 둔다

셸은 로그인 응답의 토큰을 기기에 넣어 둔다 — 웹뷰가 쿠키를 잃어도 로그인이 유지되게
만든 길이다. 그 토큰은 **서명된 쿠키 값 그 자체**라 꺼내면 그대로 쓸 수 있다.

`@capacitor/preferences` 는 평문이다. iOS 에서는 `UserDefaults.standard`(플러그인 소스에
그렇게 적혀 있다)라 앱 백업에 그대로 딸려 가고, iOS 에는 백업에서 빼는 스위치가 없다.
그래서 `@aparajita/capacitor-secure-storage` 를 싣고 그쪽으로 옮겼다 — iOS 는 시스템
키체인, 안드로이드는 KeyStore 키로 암호화한 SharedPreferences 다.

- 키체인 접근성은 **이 기기에서만**(`whenUnlockedThisDeviceOnly`). 기본값으로 두면
  암호화 백업으로 새 기기에 따라간다 — 옮긴 뜻이 반만 남는다
- iCloud 키체인 동기화는 끈다. 같은 계정의 다른 기기에서 되살아나면 안 된다
- 플러그인이 없으면 브릿지는 말없이 Preferences 로 돌아간다. 그래서 **의존성만 올리고
  `cap sync` 를 안 돌리면 조용히 예전으로 간다** — `apps/web/test/native-shell-config.test.ts`
  의 '안전 저장소' 가 네이티브 프로젝트 셋에 등록됐는지까지 본다
- 이미 로그인해 둔 사람의 토큰은 앱이 뜰 때 한 번 옮기고 옛 자리를 지운다. 로그아웃은
  두 자리를 다 지운다

### 기기에서 확인할 것

게이트는 앱을 빌드하지 않는다. 플러그인이나 그 판을 건드렸으면 여기까지 한 번 본다.

1. 로그인 → 앱 완전 종료 → 다시 켜기. 로그인이 유지되는지
2. 로그아웃 → 다시 켜기. 로그인 화면이 나오는지
3. **옛 판에서 올라온 경우**: 이 플러그인 없는 빌드로 로그인해 두고(Preferences 에 토큰이
   생긴다) 새 빌드로 바꿔 띄운다. 로그아웃되지 않아야 한다
4. 앱을 지우고 다시 설치. iOS 키체인 항목은 앱을 지워도 남아서 옛 토큰이 되살아날 수
   있는데, 서버가 거절하면(401) 셸이 그것을 지운다(`components/native-session.tsx`)

안드로이드는 눈으로 안 보고도 볼 수 있다. 디버그 빌드라 `run-as` 가 열린다 —
**값은 찍지 않는다. 살아 있는 자격증명이다.**

```bash
adb shell run-as test.plain.shop ls -l /data/data/test.plain.shop/shared_prefs/
# 옮겨졌으면: CapacitorStorage.xml 은 <map/> 이고
#             WSSecureStorageSharedPreferences.xml 이 새로 생긴다
adb shell run-as test.plain.shop grep -c 'capacitor-storage_shop.session-token' \
  /data/data/test.plain.shop/shared_prefs/WSSecureStorageSharedPreferences.xml

adb logcat -d --pid=$(adb shell pidof test.plain.shop) | grep -i capacitor
#   "Registering plugin instance: SecureStorage" 가 있어야 플러그인이 실린 것이다
adb shell dumpsys package test.plain.shop | grep 'flags=\['   # ALLOW_BACKUP 이 없어야 한다
adb shell pm get-app-links test.plain.shop                    # 1 이면 앱 링크가 걸렸다
unzip -p app-debug.apk assets/capacitor.plugins.json          # APK 에 실린 플러그인 목록
```

## 딥링크를 실제로 켜려면

파일은 다 들어 있지만 **사람이 넣어야 하는 값이 둘** 남아 있다. 둘 다 없으면
맺음 파일이 404 로 나가고, 링크는 조용히 브라우저로 열린다.

### 어떤 주소가 앱을 여는가

첫 화면과 매대·상품(`/product/`·`/category/`·`/brand/`·`/collection/`)뿐이다.
`/api/`·`/checkout/` 은 **일부러 뺀다** — 결제사가 돌려보내는 주소와 소셜
로그인 응답을 앱이 가로채면 그 흐름이 거기서 끊긴다.

목록은 `apps/web` 의 `src/lib/deep-link.ts` 한 곳에 있다. iOS 는 그것으로 만든
문서를 받아 가고, 안드로이드는 `AndroidManifest.xml` 에 손으로 옮겨 적는다
(안드로이드는 설정 파일을 안 읽는다). 둘이 어긋나면
`apps/web/test/app-links.test.ts` 가 진다.

### 안드로이드

서명 인증서의 SHA-256 지문을 웹앱 환경에 넣는다. 여러 개면 쉼표로 잇는다
(디버그 키·배포 키·구글 플레이 재서명 키가 서로 다르다).

```
ANDROID_CERT_SHA256=AA:BB:...:FF
```

지문 보기:

```bash
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android
```

### iOS

애플 팀 ID 를 웹앱 환경에 넣는다.

```
APPLE_TEAM_ID=ABCDE12345
```

그리고 **Xcode 에서 한 걸음**: App 타깃 → Signing & Capabilities →
Associated Domains 를 켠다. `App/App.entitlements` 는 이미 있지만, 그 자리를
켜야 서명에 실려 간다. 유료 개발자 계정이 필요하다.

### 구글 로그인 (iOS)

`GOOGLE_IOS_CLIENT_ID` 를 웹앱 환경에 넣는다. 이 값은 **`App/Info.plist` 의
`GIDClientID` 와 같아야 한다** — 돌아올 주소의 스킴이 그 ID 를 뒤집어 만든
값이기 때문이다. 어긋나면 계정 선택을 마치고 앱으로 못 돌아오고, 오류 화면도
없이 그냥 멈춘다. plist 안에서 ID 와 스킴이 맞는지는
`apps/web/test/native-identity.test.ts` 가 보지만, 환경에 넣는 값은 거기서
볼 수 없다. 클라이언트를 새로 발급하면 **plist 와 환경을 같이** 고친다.

### 확인

```bash
curl https://<도메인>/.well-known/assetlinks.json
curl https://<도메인>/.well-known/apple-app-site-association
```

404 면 값이 아직 안 들어간 것이다. 자리만 채운 파일을 올리지 않는 이유는
애플·구글이 그것을 받아 가 캐시하기 때문이다 — 없는 것이 틀린 것보다 낫다.

