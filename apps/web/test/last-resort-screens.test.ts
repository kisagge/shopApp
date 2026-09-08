import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOCALES } from '@shop/i18n/locale';

/**
 * 마지막에 뜨는 두 화면.
 *
 * 하나는 루트 레이아웃까지 깨졌을 때(global-error), 하나는 앱이 네트워크를
 * 못 잡았을 때(mobile/www/index.html)다. 화면 쉰두 장을 세 말로 옮겨 놓고
 * **정작 이 둘이 한국어 전용이었다** — 무언가 깨졌을 때 외국어 사용자가
 * 보게 되는 자리다.
 *
 * 둘 다 평소의 다국어 장치가 닿지 않는다. 앞은 레이아웃을 대신 그리느라
 * 껍데기가 없고, 뒤는 웹뷰 바깥의 정적 파일이다. 그래서 문구를 파일 안에
 * 적었고, **적었다는 것 자체가 빠뜨리기 쉬운 상태**라 여기서 지킨다.
 */

const WEB = join(__dirname, '..', 'src', 'app', 'global-error.tsx');
const OFFLINE = join(__dirname, '..', '..', 'mobile', 'www', 'index.html');

const read = (path: string) => readFileSync(path, 'utf8');

describe('깨졌을 때 뜨는 화면도 세 말을 갖춘다', () => {
  it.each(LOCALES)('global-error 에 %s 문구가 있다', (locale) => {
    // Record<Locale, …> 라 빠지면 컴파일이 먼저 깨지지만, 그 타입을 느슨하게
    // 바꾸는 순간 조용해진다. 바이트로도 한 번 확인해 둔다.
    expect(read(WEB)).toMatch(new RegExp(`\\b${locale}:\\s*\\{`));
  });

  it.each(LOCALES)('오프라인 화면에 %s 문구가 있다', (locale) => {
    expect(read(OFFLINE)).toMatch(new RegExp(`\\b${locale}:\\s*\\{`));
  });

  /**
   * **사전을 끌어오면 안 된다.**
   *
   * `@shop/i18n` 은 진입점이 하나라, 문구 하나를 가져오려 해도 세 벌 사전이
   * 통째로 딸려 온다. 계약에서 상수를 가져왔다가 Zod 384KB 가 따라온 것과
   * 같은 자리다. 게다가 이 화면은 **앱이 깨졌을 때 마지막으로 뜨는 것**이라,
   * 큰 모듈에 기대면 그 모듈이 원인일 때 함께 무너진다.
   *
   * 말 목록 같은 작은 것은 `@shop/i18n/locale` 로 가져온다 — 사전이 없다.
   */
  it('global-error 가 사전을 가져오지 않는다', () => {
    const source = read(WEB);
    const barrel = source.match(/from '@shop\/i18n'/g) ?? [];
    expect(
      barrel,
      "@shop/i18n 진입점은 사전 세 벌을 함께 끌고 온다. '@shop/i18n/locale' 을 쓴다.",
    ).toEqual([]);
  });

  /**
   * **오프라인 화면은 바깥을 부르지 않는다.**
   *
   * 연결이 없을 때 보여 줄 화면이 연결을 필요로 하면 뜻이 없다. 파일 안 주석에
   * 그렇게 적혀 있는데, 적어 두는 것만으로는 지켜지지 않는다 — 글꼴 하나를
   * 예쁘게 바꾸려다 링크를 다는 것이 자연스러운 실수다.
   */
  it('연결이 돌아오면 스스로 다시 들어간다', () => {
    /*
     * 비행기 모드를 끄는 것은 이 화면을 보고 있는 동안 일어난다. 단추를
     * 눌러야만 다시 시도하면, 연결이 이미 돌아왔는데도 앱은 계속 "연결할
     * 수 없습니다" 를 띄운 채로 있다.
     */
    expect(read(OFFLINE)).toMatch(/addEventListener\(\s*'online'/);
    expect(read(OFFLINE)).toContain('location.reload()');
  });

  it('아직 끊겨 있을 때 누르면 눌린 티를 낸다', () => {
    // 그대로 새로고침하면 같은 화면이라 단추가 고장 난 줄 안다
    expect(read(OFFLINE)).toContain('navigator.onLine');
  });

  it('움직임을 줄이라는 설정을 따른다', () => {
    expect(read(OFFLINE)).toContain('prefers-reduced-motion');
  });

  it('오프라인 화면이 바깥에서 아무것도 불러오지 않는다', () => {
    const source = read(OFFLINE);
    const remote = source.match(/(?:src|href)\s*=\s*["']\s*(?:https?:)?\/\//gi) ?? [];
    expect(remote, '연결이 없을 때 뜨는 화면이 네트워크에 기대고 있다').toEqual([]);
  });
});
