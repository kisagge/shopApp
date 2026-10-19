import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP_ID } from '~/lib/deep-link';

/**
 * 앱의 신원이 여덟 곳에 손으로 적혀 있다.
 *
 * 번들 ID 하나가 셸 설정·안드로이드 gradle·안드로이드 문자열표·Xcode 프로젝트에 흩어져 있고,
 * 이 서버가 내보내는 맺음 문서(`assetlinks.json`, `apple-app-site-association`)는 그중
 * **웹이 아는 값**(`lib/deep-link` 의 `APP_ID`)으로 만들어진다.
 *
 * **`cap sync` 는 이 값들을 맞춰 주지 않는다.** 네이티브 프로젝트의 번들 ID 는 Xcode 와
 * Android Studio 에서 손으로 고치는 값이다. 그래서 셸 설정에서 appId 를 바꾸고 동기화해도
 * 설치되는 앱의 ID 는 옛것으로 남는다 — 그러면 맺음 문서가 가리키는 앱과 실제 앱이 달라서
 * **앱 링크가 통째로, 아무 소리 없이 안 걸린다.** 기기에 설치해 링크를 눌러 보기 전에는
 * 알 방법이 없다(지금까지 비교하는 자리가 `APP_ID` ↔ 셸 설정 한 쌍뿐이었다).
 *
 * 표시 이름과 판도 같은 모양이다. 판은 두 가게에 서로 다른 번호로 올라가는 일이 흔한 사고다.
 */

const ROOT = join(process.cwd(), '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

const gradle = () => read('apps', 'mobile', 'android', 'app', 'build.gradle');
const strings = () => read('apps', 'mobile', 'android', 'app', 'src', 'main', 'res', 'values', 'strings.xml');
const pbxproj = () => read('apps', 'mobile', 'ios', 'App', 'App.xcodeproj', 'project.pbxproj');
const infoPlist = () => read('apps', 'mobile', 'ios', 'App', 'App', 'Info.plist');

/** plist 의 `<key>…</key><string>…</string>` 한 쌍 — 들여쓰기가 들쭉날쭉해서 공백을 넉넉히 본다 */
function plistString(key: string): string {
  const found = new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`).exec(infoPlist());
  expect(found, `Info.plist 에 ${key} 가 없다`).not.toBeNull();
  return found![1]!.trim();
}

/** 안드로이드 문자열표의 한 칸 */
function androidString(name: string): string {
  const found = new RegExp(`<string name="${name}">([^<]*)</string>`).exec(strings());
  expect(found, `strings.xml 에 ${name} 이 없다`).not.toBeNull();
  return found![1]!.trim();
}

/** Xcode 설정값 — 빌드 설정마다 한 번씩 나오므로 전부 모은다 */
function buildSettings(key: string): string[] {
  const all = [...pbxproj().matchAll(new RegExp(`${key} = ([^;]+);`, 'g'))].map((m) => m[1]!.trim());
  expect(all.length, `${key} 를 pbxproj 에서 못 찾았다`).toBeGreaterThan(0);
  return all;
}

beforeEach(() => {
  vi.resetModules();
});

/** 셸 설정 — 개발용 주소를 주지 않은 상태 */
async function shellConfig() {
  delete process.env['CAP_SERVER_URL'];
  vi.resetModules();
  return (await import('../../mobile/capacitor.config')).default;
}

describe('번들 ID', () => {
  it('웹이 맺음 문서에 적는 값과 셸 설정이 같다', async () => {
    expect((await shellConfig()).appId).toBe(APP_ID);
  });

  it('안드로이드가 설치될 이름과 같다', () => {
    // applicationId 가 실제 패키지다. assetlinks.json 의 package_name 이 이것과 달라지면
    // 구글이 지문을 견주지 못하고, autoVerify 가 조용히 실패한다.
    expect(/applicationId\s+"([^"]+)"/.exec(gradle())?.[1]).toBe(APP_ID);
    expect(/namespace\s*=\s*"([^"]+)"/.exec(gradle())?.[1]).toBe(APP_ID);
  });

  it('안드로이드 문자열표의 값과 같다', () => {
    expect(androidString('package_name')).toBe(APP_ID);
    /*
     * Capacitor 가 쓰는 custom scheme 이다. 관례가 번들 ID 와 같은 글자라 함께 본다.
     * 지금 이 스킴으로 들어오는 길에 기대는 것은 없다 — 셸의 `onAppUrlOpen` 은 웹앱과
     * 같은 origin 의 https 주소만 통과시킨다. 그래도 어긋나 있으면 읽는 사람이 헷갈린다.
     */
    expect(androidString('custom_url_scheme')).toBe(APP_ID);
  });

  it('iOS 가 서명될 이름과 같다', () => {
    // 애플 문서는 `팀ID.번들ID` 를 적어 보낸다. 이것이 다르면 유니버설 링크가 안 걸린다.
    expect([...new Set(buildSettings('PRODUCT_BUNDLE_IDENTIFIER'))]).toEqual([APP_ID]);
  });

  it('빌드 설정마다 같은 것을 쓴다 — 디버그만 다른 앱이 되지 않는다', () => {
    const ids = buildSettings('PRODUCT_BUNDLE_IDENTIFIER');
    expect(ids.length, 'Debug·Release 두 자리는 있어야 한다').toBeGreaterThanOrEqual(2);
    expect(new Set(ids).size).toBe(1);
  });
});

describe('화면에 보이는 이름', () => {
  it('셸 설정과 iOS 가 같다', async () => {
    const appName = (await shellConfig()).appName;
    expect(appName).toBeTruthy();
    expect(plistString('CFBundleDisplayName')).toBe(appName);
  });

  it('셸 설정과 안드로이드가 같다', async () => {
    const appName = (await shellConfig()).appName;
    expect(androidString('app_name')).toBe(appName);
    // 최근 앱 목록에 뜨는 이름이다. 다르면 같은 앱이 두 이름으로 보인다.
    expect(androidString('title_activity_main')).toBe(appName);
  });
});

describe('판', () => {
  /**
   * 두 가게에 **같은 판**으로 올라가야 한다.
   *
   * 한쪽만 올리면 "안드로이드는 1.1 인데 iOS 는 1.0" 이 되고, 문의를 받을 때 어느 판에서
   * 난 일인지 가릴 수 없다. 숫자가 두 곳에 손으로 적혀 있으니 한쪽을 잊는 것이 기본값이다.
   */
  it('사람이 보는 판이 두 플랫폼에서 같다', () => {
    const android = /versionName\s+"([^"]+)"/.exec(gradle())?.[1];
    expect(android).toBeTruthy();
    expect([...new Set(buildSettings('MARKETING_VERSION'))]).toEqual([android]);
  });

  it('올릴 때 쓰는 번호도 같다', () => {
    const android = /versionCode\s+(\d+)/.exec(gradle())?.[1];
    expect(android).toBeTruthy();
    expect([...new Set(buildSettings('CURRENT_PROJECT_VERSION'))]).toEqual([android]);
  });
});

describe('구글이 앱으로 돌아오는 주소', () => {
  /**
   * **같은 클라이언트 ID 가 Info.plist 에 두 번 적혀 있다.**
   *
   * 한 번은 `GIDClientID` 로, 한 번은 돌아올 주소의 스킴으로 — 그 스킴은 ID 를 점 단위로
   * 뒤집은 값이라는 것이 구글의 규칙이라, 둘은 서로의 복사본이다. 손으로 적는 복사본이고,
   * 어긋나면 계정 선택을 마치고 **앱으로 돌아오지 못한다.** 오류 화면도 없이 그냥 멈춘다.
   *
   * 실행할 때 쓰는 값은 또 다른 자리에서 온다 — 웹앱 환경의 `GOOGLE_IOS_CLIENT_ID` 를
   * 셸에 넘긴다(`@shop/auth` 의 `googleNativeClientIds`). 그 값은 여기서 볼 수 없으니,
   * **환경에 넣는 값이 아래 ID 와 같아야 한다**는 것만 적어 둔다. apps/mobile/README.md 에도.
   */
  const SUFFIX = '.apps.googleusercontent.com';

  it('클라이언트 ID 가 구글이 주는 모양이다', () => {
    expect(plistString('GIDClientID')).toMatch(
      new RegExp(`^[0-9]+-[a-z0-9]+${SUFFIX.replace(/\./g, '\\.')}$`),
    );
  });

  it('돌아올 주소가 그 ID 를 뒤집은 값이다', () => {
    const clientId = plistString('GIDClientID');
    const schemes = [...infoPlist().matchAll(/<key>CFBundleURLSchemes<\/key>\s*<array>([\s\S]*?)<\/array>/g)]
      .flatMap((m) => [...m[1]!.matchAll(/<string>([^<]*)<\/string>/g)].map((s) => s[1]!.trim()));

    expect(schemes).toEqual([`com.googleusercontent.apps.${clientId.slice(0, -SUFFIX.length)}`]);
  });
});
