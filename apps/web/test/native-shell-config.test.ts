import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** 저장소 뿌리 — apps/web 에서 두 칸 위 */
const ROOT = join(process.cwd(), '..', '..');
const read = (path: string) => readFileSync(path, 'utf8');

/**
 * 네이티브 셸 설정.
 *
 * `apps/mobile` 에는 검사가 하나도 없었다. 그 폴더에는 화면이 없어서 —
 * 껍데기가 배포된 웹앱을 불러올 뿐이라 — 볼 것이 없어 보인다. 그런데
 * **거기에 안전 속성이 몇 개 있고, 그것들은 눈으로만 지켜지고 있었다.**
 *
 * 웹뷰에는 주소창이 없다. 평문으로 열어 두면 중간에서 응답을 바꿔치기해도
 * 사용자가 알아챌 방법이 전혀 없다 — 브라우저라면 자물쇠가 없는 것으로
 * 보이겠지만 앱에서는 아무 표시도 없다.
 *
 * 개발 중에는 실기기에서 내 컴퓨터를 봐야 하므로 평문이 필요하다. 그래서
 * **주소가 http 일 때만** 켠다. 이 파일은 그 규칙이 유지되는지 본다.
 */

const KEEP = { ...process.env };

beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  process.env = { ...KEEP };
});

/** 환경을 바꿔 설정을 다시 읽는다 — 모듈이 최상위에서 env 를 읽기 때문이다 */
async function configWith(serverUrl?: string) {
  if (serverUrl === undefined) delete process.env['CAP_SERVER_URL'];
  else process.env['CAP_SERVER_URL'] = serverUrl;
  vi.resetModules();
  return (await import('../../mobile/capacitor.config')).default;
}

describe('기본값 — 아무것도 안 주면', () => {
  it('배포된 웹앱을 https 로 불러온다', async () => {
    const config = await configWith();
    expect(config.server?.url).toMatch(/^https:\/\//);
  });

  it('평문을 허용하지 않는다', async () => {
    // 웹뷰에는 주소창이 없다. 여기가 true 로 굳으면 아무도 못 알아챈다.
    const config = await configWith();
    expect(config.server?.cleartext).toBe(false);
  });

  it('안드로이드 기본 스킴이 https 다', async () => {
    const config = await configWith();
    expect(config.server?.androidScheme).toBe('https');
  });

  it('배포 빌드에서 웹뷰 디버거를 열어 두지 않는다', async () => {
    // 켜 두면 USB 로 연결한 누구든 앱의 웹뷰를 들여다볼 수 있다
    const config = await configWith();
    expect(config.android?.webContentsDebuggingEnabled).toBe(false);
  });
});

describe('시작 화면', () => {
  /**
   * 셸은 화면을 **네트워크로** 받아 온다. 그 사이를 비워 두면 흰 화면이고,
   * 사용자는 앱이 멈춘 줄 안다.
   */
  const splash = async () =>
    (await configWith()).plugins?.['SplashScreen'] as Record<string, unknown> | undefined;

  it('설정이 있다', async () => {
    expect(await splash()).toBeTruthy();
  });

  it('스스로 내려가는 상한이 있다', async () => {
    /*
     * **여기가 이 설정에서 가장 위험한 자리다.** autoHide 를 끄면 내리는
     * 일이 전적으로 웹에 달리는데, 웹뷰가 아예 못 뜨면 시작 화면이 영원히
     * 남는다 — 앱이 죽은 것과 구분되지 않는다.
     */
    const s = await splash();
    expect(s?.['launchAutoHide']).toBe(true);
    expect(s?.['launchShowDuration']).toBeGreaterThanOrEqual(3_000);
  });

  it('웹앱과 같은 배경색이다 — 이음매가 보이면 안 된다', async () => {
    // packages/ui 의 --color-n-0. 웹 manifest 의 background_color 와도 같다.
    expect((await splash())?.['backgroundColor']).toBe('#fefdfc');
  });

  it('웹이 화면을 그린 뒤 직접 내린다', () => {
    const bridge = read(join(ROOT, 'packages', 'native', 'src', 'index.ts'));
    expect(bridge).toContain('SplashScreen');
    expect(bridge).toContain('hideSplash');
  });

  it('오프라인 화면도 스스로 내린다', () => {
    /*
     * 이 화면이 뜨는 상황은 웹앱이 못 온 상황이다. 웹이 내려 주기를 기다리면
     * 상한이 지날 때까지 할 말이 시작 화면에 가려 안 보인다.
     */
    expect(read(join(ROOT, 'apps', 'mobile', 'www', 'index.html'))).toContain('SplashScreen');
  });
});

describe('개발 중 주소를 줄 때', () => {
  it('https 주소를 주면 평문은 그대로 막힌다', async () => {
    const config = await configWith('https://staging.example.test');
    expect(config.server?.url).toBe('https://staging.example.test');
    expect(config.server?.cleartext).toBe(false);
  });

  it('http 주소를 줄 때만 평문이 열린다', async () => {
    /*
     * 실기기에서 내 컴퓨터를 보려면 필요하다. **주소를 http 로 대놓고 줄
     * 때만** 열리고, 그 외에는 절대 안 열린다는 것이 규칙이다.
     */
    const config = await configWith('http://192.168.0.10:3000');
    expect(config.server?.url).toBe('http://192.168.0.10:3000');
    expect(config.server?.cleartext).toBe(true);
  });

  it('평문 여부는 주소에서 나온다 — 따로 켜는 스위치가 없다', async () => {
    // 스위치가 따로 있으면 주소는 https 인데 평문이 열린 상태가 만들어진다
    const source = (await import('node:fs')).readFileSync(
      new URL('../../mobile/capacitor.config.ts', import.meta.url),
      'utf8',
    );
    expect(source).toContain("cleartext: serverUrl.startsWith('http://')");
  });
});
