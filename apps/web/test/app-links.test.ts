import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP_ID, DEEP_LINK_PATHS, DEEP_LINK_BLOCKED } from '~/lib/deep-link';

/**
 * 앱 링크 — 같은 약속이 네 곳에 적혀 있다.
 *
 * 공유받은 `https://…/product/…` 를 브라우저가 아니라 앱이 열게 하려면 네 자리가 서로 맞아야
 * 한다: 셸이 불러오는 도메인(`capacitor.config.ts`), iOS 연관 도메인(`App.entitlements`),
 * 안드로이드 intent-filter(`AndroidManifest.xml`), 그리고 이 서버가 내보내는 문서 둘.
 *
 * **AndroidManifest 는 "apps/web 의 검사가 그것을 지킨다" 고 적어 두고 있었다.** 그런 검사는
 * 없었다 — 도메인을 비교하는 자리가 저장소에 한 군데도 없다. 약속만 있는 그물이 가장 나쁘다:
 * 있다고 믿게 만들어서 아무도 다시 안 본다(`point.ts` 가 같은 모양이었다).
 *
 * 틀렸을 때 **아무 소리도 나지 않는다**는 것이 이 자리의 성질이다. 호스트가 어긋나면
 * 안드로이드는 조용히 브라우저로 가고, iOS 는 그냥 사파리로 간다. 오류도 로그도 없다.
 */

const ROOT = join(process.cwd(), '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

const manifest = () => read('apps', 'mobile', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
const entitlements = () => read('apps', 'mobile', 'ios', 'App', 'App', 'App.entitlements');

/** 셸이 기본으로 불러오는 주소 — 개발용 주소를 주지 않은 상태 */
async function shellHost(): Promise<string> {
  delete process.env['CAP_SERVER_URL'];
  vi.resetModules();
  const config = (await import('../../mobile/capacitor.config')).default;
  return new URL(config.server!.url!).host;
}

/** 앱 링크 intent-filter 한 덩이 — MAIN/LAUNCHER 쪽이 아니라 VIEW 쪽 */
function appLinkFilter(): string {
  const found = [...manifest().matchAll(/<intent-filter[^>]*>([\s\S]*?)<\/intent-filter>/g)]
    .map((m) => m[0])
    .filter((block) => block.includes('android.intent.action.VIEW'));
  expect(found, 'VIEW 를 받는 intent-filter 가 하나여야 한다').toHaveLength(1);
  return found[0]!;
}

const attrs = (block: string, name: string): string[] =>
  [...block.matchAll(new RegExp(`${name}="([^"]+)"`, 'g'))].map((m) => m[1]!);

const KEEP = { ...process.env };
beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  process.env = { ...KEEP };
});

describe('도메인이 세 곳에 적혀 있다', () => {
  it('iOS 연관 도메인이 셸이 불러오는 곳과 같다', async () => {
    const host = await shellHost();
    const applinks = [...entitlements().matchAll(/applinks:([^<\s]+)/g)].map((m) => m[1]!);

    expect(applinks, '연관 도메인이 하나여야 한다 — 늘어나면 어느 것이 진짜인지 모른다').toEqual([host]);
  });

  it('안드로이드 앱 링크 호스트가 셸이 불러오는 곳과 같다', async () => {
    const host = await shellHost();
    const hosts = [...new Set(attrs(appLinkFilter(), 'android:host'))];

    // 줄마다 다시 적으므로 하나라도 어긋나면 그 줄만 조용히 안 걸린다
    expect(hosts).toEqual([host]);
  });

  it('호스트는 https 로만 받는다', () => {
    // 평문으로 받으면 중간에서 바꿔치기한 링크가 앱을 연다
    expect([...new Set(attrs(appLinkFilter(), 'android:scheme'))]).toEqual(['https']);
  });
});

describe('앱 링크가 실제로 걸리려면', () => {
  it('autoVerify 가 켜져 있다', () => {
    /*
     * 끄면 "이 앱으로 열까요" 를 사용자가 골라야 하고, 고르지 않으면 브라우저로 간다.
     * 켜져 있어야 설치할 때 안드로이드가 assetlinks.json 을 받아 가 굳힌다.
     */
    expect(appLinkFilter()).toContain('android:autoVerify="true"');
  });

  it('브라우저에서 넘어오는 갈래가 열려 있다', () => {
    // BROWSABLE 이 없으면 링크를 눌러서 오는 길이 막힌다 — 그래도 오류는 안 난다
    for (const needed of [
      'android.intent.action.VIEW',
      'android.intent.category.DEFAULT',
      'android.intent.category.BROWSABLE',
    ]) {
      expect(appLinkFilter(), needed).toContain(needed);
    }
  });

  it('앱 링크를 받는 화면이 하나로 유지된다', () => {
    // singleTask 가 아니면 링크마다 화면이 새로 쌓여 뒤로 가기가 뒤엉킨다
    expect(manifest()).toContain('android:launchMode="singleTask"');
  });
});

describe('앱으로 보낼 길', () => {
  /** manifest 가 적어 둔 길 — `/` 는 그 자리 하나(path), 나머지는 그 아래 전부(pathPrefix) */
  const manifestPaths = (): string[] => {
    const block = appLinkFilter();
    return [...attrs(block, 'android:pathPrefix'), ...attrs(block, 'android:path')];
  };

  it('안드로이드가 받는 길이 한 곳에서 나온 목록과 같다', () => {
    expect(manifestPaths().sort()).toEqual([...DEEP_LINK_PATHS].sort());
  });

  it('`/` 만 그 자리 하나로 적고 나머지는 아래까지 받는다', () => {
    const block = appLinkFilter();
    expect(attrs(block, 'android:path'), '`/` 를 pathPrefix 로 적으면 모든 주소가 걸린다').toEqual(['/']);
    expect(attrs(block, 'android:pathPrefix').sort()).toEqual(
      DEEP_LINK_PATHS.filter((p) => p !== '/').toSorted(),
    );
  });

  it('길을 안 적은 <data> 가 없다', () => {
    /*
     * **이것이 고친 고장이다.** 호스트만 적힌 <data> 한 줄은 그 도메인의 **모든** 주소를
     * 가져간다 — 길을 함께 적은 다른 줄들이 아무 소용이 없어진다.
     */
    const data = [...appLinkFilter().matchAll(/<data\b[^>]*\/>/g)].map((m) => m[0]);
    expect(data.length).toBeGreaterThan(0);
    const 길없는줄 = data.filter((d) => !/android:path(Prefix|Pattern)?=/.test(d));
    expect(길없는줄, '호스트만 적힌 줄이 있으면 막기로 한 길까지 앱이 먹는다').toEqual([]);
  });

  it.each(DEEP_LINK_BLOCKED)('%s 는 안드로이드에서도 앱을 열지 않는다', (blocked) => {
    /*
     * `android:path` 는 그 주소 하나와만 맞고 `android:pathPrefix` 는 그 아래 전부와 맞는다 —
     * 둘을 한 통에 넣고 보면 `/` 가 `/api/...` 까지 가져가는 줄로 읽힌다(처음에 그렇게 썼고,
     * 검사가 없는 고장을 있다고 말했다).
     */
    const block = appLinkFilter();
    const 걸리는것 = [
      ...attrs(block, 'android:pathPrefix').filter((p) => blocked.startsWith(p) || p.startsWith(blocked)),
      ...attrs(block, 'android:path').filter((p) => p.startsWith(blocked)),
    ];
    expect(걸리는것, `${blocked} 가 ${걸리는것.join(', ')} 에 걸린다`).toEqual([]);
  });
});

describe('애플에 보내는 문서', () => {
  const TEAM = 'ABCDE12345';

  async function association() {
    process.env['APPLE_TEAM_ID'] = TEAM;
    const { GET } = await import('~/app/.well-known/apple-app-site-association/route');
    const response = GET();
    expect(response.status).toBe(200);
    return (await response.json()) as {
      applinks: { details: { appIDs: string[]; components: { '/': string; exclude?: boolean }[] }[] };
    };
  }

  it('팀 ID 와 앱 이름을 붙여 앱을 가리킨다', async () => {
    const doc = await association();
    expect(doc.applinks.details[0]!.appIDs).toEqual([`${TEAM}.${APP_ID}`]);
  });

  it('막을 길을 먼저 적는다', async () => {
    /*
     * 애플은 위에서부터 보다가 처음 맞는 것에서 멈춘다. 순서가 뒤집히면 `/checkout/...` 이
     * 그 위의 어느 줄에 먼저 걸려 앱으로 가 버린다.
     */
    const components = (await association()).applinks.details[0]!.components;
    const 막는것 = components.filter((c) => c.exclude === true);
    const lastExclude = components.findLastIndex((c) => c.exclude === true);
    const firstAllow = components.findIndex((c) => c.exclude !== true);

    expect(막는것).toHaveLength(DEEP_LINK_BLOCKED.length);
    expect(lastExclude).toBeLessThan(firstAllow);
  });

  it('안드로이드와 같은 목록으로 만든다', async () => {
    const components = (await association()).applinks.details[0]!.components;
    expect(components.filter((c) => c.exclude === true).map((c) => c['/'])).toEqual(
      DEEP_LINK_BLOCKED.map((p) => `${p}*`),
    );
    expect(components.filter((c) => c.exclude !== true).map((c) => c['/'])).toEqual(
      DEEP_LINK_PATHS.map((p) => (p === '/' ? '/' : `${p}*`)),
    );
  });

  it('팀 ID 가 없으면 문서를 안 내보낸다', async () => {
    /*
     * 자리만 채운 문서를 올리면 애플이 그것을 받아 가 캐시한다 — 나중에 진짜 값을 넣어도
     * 한동안 옛것으로 판단한다. 없는 것이 틀린 것보다 낫다.
     */
    delete process.env['APPLE_TEAM_ID'];
    const { GET } = await import('~/app/.well-known/apple-app-site-association/route');
    expect(GET().status).toBe(404);
  });
});

describe('구글에 보내는 문서', () => {
  const FINGERPRINT = `${'AB:'.repeat(31)}AB`;

  it('셸의 앱 이름을 그대로 가리킨다', async () => {
    process.env['ANDROID_CERT_SHA256'] = FINGERPRINT;
    const { GET } = await import('~/app/.well-known/assetlinks.json/route');
    const response = GET();
    expect(response.status).toBe(200);

    const doc = (await response.json()) as { target: { package_name: string; sha256_cert_fingerprints: string[] } }[];
    expect(doc[0]!.target.package_name).toBe(APP_ID);
    expect(doc[0]!.target.sha256_cert_fingerprints).toEqual([FINGERPRINT]);
  });

  it('지문이 없으면 문서를 안 내보낸다', async () => {
    delete process.env['ANDROID_CERT_SHA256'];
    const { GET } = await import('~/app/.well-known/assetlinks.json/route');
    expect(GET().status).toBe(404);
  });
});
