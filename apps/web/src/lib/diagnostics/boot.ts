/**
 * 이 서버 인스턴스가 언제 깨어났는지.
 *
 * **밖에서 재는 것으로는 콜드 스타트의 원인을 못 가른다.** 쉬었다 오는 첫
 * 요청이 2.2초인데, 그게 컨테이너를 띄우는 시간인지 · 코드를 읽어 들이는
 * 시간인지 · DB 에 처음 붙는 시간인지는 응답 시간 하나로는 알 수 없다.
 * 서버가 스스로 말하게 해야 나뉜다.
 *
 * 모듈이 처음 읽힐 때 한 번 계산한다 — 인스턴스마다 한 번이다.
 * `process.uptime()` 은 **노드가 시작한 뒤 흐른 시간**이라, 여기까지 오는 데
 * 든 시간(런타임 부팅 + 코드 읽어 들이기)이 그대로 담긴다. 그 앞의 컨테이너
 * 준비 시간은 우리가 볼 수 없고, 전체에서 이 값을 빼면 그쪽 몫이 남는다.
 */
const LOADED_AFTER_MS = Math.round(process.uptime() * 1000);

let served = 0;

export interface BootTiming {
  /** 노드 시작부터 이 모듈이 읽히기까지. 인스턴스마다 고정이다. */
  readonly loadMs: number;
  /** 이 인스턴스가 이번 요청까지 처리한 횟수. 1 이면 이 요청이 콜드 스타트를 냈다. */
  readonly requestNo: number;
  /** 요청 시점의 인스턴스 나이. 첫 요청이면 콜드 스타트에 가깝다. */
  readonly ageMs: number;
}

export function markRequest(): BootTiming {
  served += 1;
  return {
    loadMs: LOADED_AFTER_MS,
    requestNo: served,
    ageMs: Math.round(process.uptime() * 1000),
  };
}

/**
 * 표준 진단 채널에 싣는다.
 *
 * 본문을 건드리지 않는다 — `/api/health` 는 앱 셸이 도달 가능 여부를 볼 때
 * 쓰는 창구라, 응답 모양이 바뀌면 그쪽이 흔들린다. Server-Timing 은 원래
 * 이런 값을 나르는 자리이고 개발자 도구가 그대로 보여 준다.
 *
 * 담기는 것은 인스턴스 나이와 처리 횟수뿐이다. 사용자도 자격증명도 아니다.
 */
export function serverTiming(timing: BootTiming): string {
  return [
    `load;dur=${timing.loadMs}`,
    `age;dur=${timing.ageMs}`,
    `req;dur=${timing.requestNo}`,
  ].join(', ');
}
