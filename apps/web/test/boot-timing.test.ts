import { describe, it, expect } from 'vitest';
import { markRequest, serverTiming } from '~/lib/diagnostics/boot';

/**
 * 콜드 스타트를 가르는 자.
 *
 * **밖에서 재는 것으로는 원인을 못 가른다.** 쉬었다 오는 첫 요청이 2.2초인데,
 * 그게 컨테이너를 띄우는 시간인지 · 코드를 읽어 들이는 시간인지 · DB 에 처음
 * 붙는 시간인지는 응답 시간 하나로는 알 수 없다.
 */

describe('인스턴스가 스스로 말한다', () => {
  it('처리 횟수를 센다 — 1 이면 그 요청이 콜드 스타트를 냈다', () => {
    const first = markRequest();
    const second = markRequest();

    expect(second.requestNo).toBe(first.requestNo + 1);
  });

  /** 인스턴스마다 고정이다. 요청마다 달라지면 잰 값이 아니라 잡음이다. */
  it('읽어 들인 시각은 요청 사이에 변하지 않는다', () => {
    expect(markRequest().loadMs).toBe(markRequest().loadMs);
  });

  it('나이는 줄지 않는다', () => {
    const a = markRequest();
    const b = markRequest();
    expect(b.ageMs).toBeGreaterThanOrEqual(a.ageMs);
  });
});

describe('표준 진단 채널에 싣는다', () => {
  /**
   * 본문을 건드리지 않는다 — /api/health 는 앱 셸이 도달 가능 여부를 볼 때
   * 쓰는 창구라, 응답 모양이 바뀌면 그쪽이 흔들린다.
   */
  it('Server-Timing 형식이다', () => {
    const header = serverTiming({ loadMs: 120, ageMs: 340, requestNo: 1 });

    expect(header).toBe('load;dur=120, age;dur=340, req;dur=1');
  });

  it('담기는 것은 시간과 횟수뿐이다 — 사용자도 자격증명도 아니다', () => {
    const header = serverTiming(markRequest());
    expect(header).toMatch(/^load;dur=\d+, age;dur=\d+, req;dur=\d+$/);
  });
});
