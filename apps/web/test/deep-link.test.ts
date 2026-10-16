import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP_ID, appleTeamId, androidFingerprints } from '~/lib/deep-link';
import { describeTemplateProblem } from '~/lib/notifications/template-problems';
import type { TemplateProblem } from '@shop/core';

/**
 * 앱과 이 도메인을 맺어 주는 값들.
 *
 * **두 파일 다 값이 없으면 아예 내보내지 않는다.** 자리만 채운 파일을 올리면 애플과 구글이
 * 그것을 받아 가 캐시하고, 나중에 진짜 값을 넣어도 한동안 옛것으로 판단한다 — 없는 것이
 * 틀린 것보다 낫다. 그 판단을 하는 것이 아래 두 함수다.
 */

afterEach(() => vi.unstubAllEnvs());

/**
 * **앱 이름이 두 곳에 적혀 있었다.**
 *
 * `deep-link.ts` 가 "셸의 appId 와 같아야 한다" 고 적어 두었는데, 맞춰 보는 것이 없었다.
 * 갈리면 `.well-known` 이 셸에 없는 앱을 가리키고 — **앱 링크가 조용히 안 열린다.** 눌러도
 * 브라우저가 뜰 뿐이라, 고장 났다는 것을 알아채기까지 오래 걸린다.
 */
describe('앱 이름', () => {
  it('셸의 appId 와 같다', () => {
    const config = readFileSync(join(process.cwd(), '..', 'mobile', 'capacitor.config.ts'), 'utf8');
    const found = /appId:\s*'([^']+)'/.exec(config);

    expect(found, 'capacitor.config 에서 appId 를 못 찾았다 — 찾는 규칙이 어긋났다').not.toBeNull();
    expect(APP_ID, '웹이 내보내는 앱 이름과 셸의 appId 가 다르다 — 앱 링크가 조용히 안 열린다')
      .toBe(found![1]);
  });
});

describe('애플 팀 아이디', () => {
  it('없으면 null 이다 — 자리만 채운 파일을 올리지 않는다', () => {
    vi.stubEnv('APPLE_TEAM_ID', '');

    expect(appleTeamId()).toBeNull();
  });

  it('공백만 있어도 없는 것으로 본다', () => {
    vi.stubEnv('APPLE_TEAM_ID', '   ');

    expect(appleTeamId()).toBeNull();
  });

  it('앞뒤 공백은 떼고 쓴다 — 붙여 넣으면 딸려 온다', () => {
    vi.stubEnv('APPLE_TEAM_ID', '  ABCDE12345  ');

    expect(appleTeamId()).toBe('ABCDE12345');
  });
});

/**
 * 서명 인증서의 SHA-256 지문. **콜론으로 끊긴 대문자 16진수 32쌍**이다. 여러 개를 쉼표로 줄
 * 수 있다 — 디버그 키와 배포 키가 다르고, 구글 플레이가 다시 서명하면 또 달라진다.
 */
describe('안드로이드 지문', () => {
  const ok = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0').toUpperCase()).join(':');

  it('없으면 빈 목록이다', () => {
    vi.stubEnv('ANDROID_CERT_SHA256', '');

    expect(androidFingerprints()).toEqual([]);
  });

  it('맞는 지문을 그대로 쓴다', () => {
    vi.stubEnv('ANDROID_CERT_SHA256', ok);

    expect(androidFingerprints()).toEqual([ok]);
  });

  /** 키가 여럿이다 — 디버그와 배포가 다르고 플레이가 다시 서명하면 또 다르다 */
  it('쉼표로 여럿을 받는다', () => {
    vi.stubEnv('ANDROID_CERT_SHA256', `${ok}, ${ok}`);

    expect(androidFingerprints()).toEqual([ok, ok]);
  });

  it('소문자로 적어도 대문자로 맞춘다', () => {
    vi.stubEnv('ANDROID_CERT_SHA256', ok.toLowerCase());

    expect(androidFingerprints()).toEqual([ok]);
  });

  /*
   * **모양이 틀린 것은 버린다.** 자리만 채운 값이 섞여 들어가면 구글이 그것을 받아 가
   * 캐시한다 — 없는 것이 틀린 것보다 낫다.
   */
  it.each([
    ['짧은 것', ok.slice(0, -3)],
    ['긴 것', `${ok}:FF`],
    ['콜론이 없는 것', ok.replaceAll(':', '')],
    ['16진수가 아닌 것', ok.replace('00', 'ZZ')],
    ['자리만 채운 값', 'PUT_YOUR_FINGERPRINT_HERE'],
  ])('%s 은 버린다', (_why, bad) => {
    vi.stubEnv('ANDROID_CERT_SHA256', bad);

    expect(androidFingerprints()).toEqual([]);
  });

  it('맞는 것과 틀린 것이 섞이면 맞는 것만 남는다', () => {
    vi.stubEnv('ANDROID_CERT_SHA256', `${ok},없는값`);

    expect(androidFingerprints()).toEqual([ok]);
  });
});

/**
 * **저장 전 화면과 서버의 거절이 같은 말을 한다.** 둘이 다르면 화면은 괜찮다고 했는데 저장이
 * 다른 이유로 막힌 것처럼 읽힌다.
 */
describe('템플릿 문제를 읽는 말로', () => {
  /**
   * 종류마다 하나씩. `TemplateProblem` 은 값 목록이 아니라 타입 합집합이라 폴더에서 뽑을 수
   * 없다 — 대신 **타입이 센다**: 종류가 하나 늘면 아래 목록이 그 종류를 빠뜨렸다고 컴파일이
   * 먼저 진다(`Record<TemplateProblem['kind'], …>`).
   */
  const SAMPLES: Record<TemplateProblem['kind'], TemplateProblem> = {
    EMPTY: { kind: 'EMPTY' },
    TOO_LONG: { kind: 'TOO_LONG', max: 120 },
    UNKNOWN_PLACEHOLDER: { kind: 'UNKNOWN_PLACEHOLDER', names: ['orderNo'] },
    BROKEN_BRACE: { kind: 'BROKEN_BRACE' },
  };

  it.each(Object.entries(SAMPLES))('%s 에 사람이 읽을 말이 있다', (kind, problem) => {
    const said = describeTemplateProblem(problem);

    expect(said, `${kind} 에 할 말이 없다`).toBeTruthy();
    // 코드가 그대로 새어 나오면 운영자는 'BROKEN_BRACE' 를 읽게 된다
    expect(said).not.toContain(kind);
  });

  it('너무 길면 몇 자까지인지 적는다', () => {
    expect(describeTemplateProblem({ kind: 'TOO_LONG', max: 120 })).toContain('120');
  });

  it('없는 값이면 어느 것인지 적는다', () => {
    const said = describeTemplateProblem({ kind: 'UNKNOWN_PLACEHOLDER', names: ['orderNo', 'name'] });

    expect(said).toContain('{orderNo}');
    expect(said).toContain('{name}');
  });

  /** 비었을 때는 되돌릴 길까지 말한다 — 빈 칸을 보고 무엇을 할지 모르면 멈춘다 */
  it('비었으면 기본 문구로 돌리는 길을 알려 준다', () => {
    expect(describeTemplateProblem({ kind: 'EMPTY' })).toContain('기본 문구로');
  });
});
