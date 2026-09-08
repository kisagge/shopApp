import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 앱 링크 · 유니버설 링크.
 *
 * 공유받은 https 주소가 브라우저가 아니라 앱으로 열리게 하는 장치다. 세 곳이
 * **같은 도메인**을 말해야 하나라도 어긋나면 조용히 브라우저로 떨어진다 —
 * 실패했다는 신호가 어디에도 안 뜨는 종류라, 검사가 아니면 아무도 모른다.
 */
const ROOT = join(process.cwd(), '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

const KEEP = { ...process.env };
beforeEach(() => {
  vi.resetModules();
  delete process.env['APPLE_TEAM_ID'];
  delete process.env['ANDROID_CERT_SHA256'];
});
afterEach(() => {
  process.env = { ...KEEP };
});

/** capacitor.config 이 부르는 그 주소 */
function shellHost(): string {
  const source = read('apps', 'mobile', 'capacitor.config.ts');
  const url = /PRODUCTION_URL = '([^']+)'/.exec(source)?.[1] ?? '';
  return new URL(url).host;
}

describe('세 곳이 같은 도메인을 말한다', () => {
  it('셸이 부르는 주소를 읽어 온다 — 못 읽으면 아래 검사가 뜻을 잃는다', () => {
    expect(shellHost()).toMatch(/\./);
  });

  it('안드로이드 매니페스트가 그 도메인을 잡는다', () => {
    const manifest = read('apps', 'mobile', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
    expect(manifest).toContain(`android:host="${shellHost()}"`);
    // autoVerify 가 없으면 "이 앱이 연다" 로 굳지 않고 선택 창이 뜬다
    expect(manifest).toContain('android:autoVerify="true"');
  });

  it('iOS 엔타이틀먼트가 그 도메인을 잡는다', () => {
    const entitlements = read('apps', 'mobile', 'ios', 'App', 'App', 'App.entitlements');
    expect(entitlements).toContain(`applinks:${shellHost()}`);
  });
});

describe('맺음 파일', () => {
  it('값이 없으면 내보내지 않는다', async () => {
    /*
     * **자리만 채운 파일이 틀린 값보다 나쁘다.** 애플과 구글이 그것을 받아
     * 가 캐시하므로, 나중에 진짜 값을 넣어도 한동안 옛것으로 판단한다.
     */
    const apple = await import('../src/app/.well-known/apple-app-site-association/route');
    const android = await import('../src/app/.well-known/assetlinks.json/route');
    expect(apple.GET().status).toBe(404);
    expect(android.GET().status).toBe(404);
  });

  it('팀 ID 를 주면 앱 ID 를 팀.번들 로 적는다', async () => {
    process.env['APPLE_TEAM_ID'] = 'ABCDE12345';
    const { GET } = await import('../src/app/.well-known/apple-app-site-association/route');
    const body = (await GET().json()) as { applinks: { details: { appIDs: string[] }[] } };
    expect(body.applinks.details[0]?.appIDs).toEqual(['ABCDE12345.test.plain.shop']);
  });

  it('결제와 창구는 앱이 가로채지 않는다', async () => {
    /*
     * 결제사가 돌려보내는 주소까지 앱이 먹으면 승인 흐름이 끊긴다.
     * 그 자리는 열려 있던 브라우저가 그대로 이어받아야 한다.
     */
    process.env['APPLE_TEAM_ID'] = 'ABCDE12345';
    const { GET } = await import('../src/app/.well-known/apple-app-site-association/route');
    const body = (await GET().json()) as {
      applinks: { details: { components: Record<string, unknown>[] }[] };
    };
    const excluded = body.applinks.details[0]!.components.filter((c) => c['exclude'] === true);
    expect(excluded.map((c) => c['/'])).toEqual(expect.arrayContaining(['/api/*', '/checkout/*']));
  });

  it('지문 모양이 아닌 값은 버린다', async () => {
    // 잘못된 지문 하나가 섞이면 구글이 파일 전체를 물리친다
    process.env['ANDROID_CERT_SHA256'] = '이건 지문이 아니다, AA:BB';
    const { GET } = await import('../src/app/.well-known/assetlinks.json/route');
    expect(GET().status).toBe(404);
  });

  it('제대로 된 지문은 대문자로 맞춰 싣는다', async () => {
    const one = Array.from({ length: 32 }, (_, i) => (i % 2 ? 'ab' : '0f')).join(':');
    process.env['ANDROID_CERT_SHA256'] = one;
    const { GET } = await import('../src/app/.well-known/assetlinks.json/route');
    const body = (await GET().json()) as { target: { sha256_cert_fingerprints: string[] } }[];
    expect(body[0]?.target.sha256_cert_fingerprints).toEqual([one.toUpperCase()]);
  });
});
