/**
 * 이벤트 보존과 롤업의 정책.
 *
 * 이벤트 테이블은 방치하면 계속 자란다. 원본은 일정 기간만 두고, 그 전에
 * 하루치를 집계 행으로 접어 둔다. 접힌 뒤에는 원본을 지워도 지표가 남는다.
 *
 * 이 파일에는 I/O 가 없다. 날짜 경계와 "무엇을 지워도 되는가" 만 둔다.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 원본을 며칠 두는가. 이 기간이 지나고 **롤업까지 끝난** 날만 지운다. */
export const RAW_RETENTION_DAYS = 90;

/**
 * 한 번의 배치가 접을 수 있는 최대 일수.
 *
 * 크론이 며칠 멈춰 있었어도 밀린 날을 한 번에 다 처리하려 들면 안 된다.
 * 서버리스 함수는 실행 시간 제한이 있어서 중간에 끊기고, 그러면 밀린 날은
 * 영원히 밀린 채로 남는다. 조금씩 따라잡는 편이 낫다.
 */
export const MAX_DAYS_PER_RUN = 14;

/** 'YYYY-MM-DD' — KST 기준 하루 */
export type DayKey = string;

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

export class RollupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RollupError';
  }
}

export interface DayWindow {
  readonly day: DayKey;
  /** 그날 00:00 KST (UTC 인스턴트) */
  readonly start: Date;
  /** 다음 날 00:00 KST. **끝은 포함하지 않는다** */
  readonly end: Date;
}

/**
 * 어떤 시각이 속한 KST 날짜.
 *
 * UTC 로 자르면 매일 오전 9시 이전의 이벤트가 앞날로 넘어간다. 하루 매출을
 * 보는 표에서 아침 9시간이 어제 칸에 들어가는 셈이라, 오전에만 바쁜 날은
 * 통째로 잘못 읽힌다.
 */
export function dayKeyOf(instant: Date): DayKey {
  const kst = new Date(instant.getTime() + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 'YYYY-MM-DD' 를 KST 하루 경계로 바꾼다 */
export function dayWindow(day: DayKey): DayWindow {
  const match = DAY_KEY.exec(day);
  if (!match) throw new RollupError(`날짜 형식이 잘못됐습니다: ${day}`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);

  // KST 자정 = 그날 UTC 15:00 (전날)
  const start = new Date(Date.UTC(year, month - 1, date) - KST_OFFSET_MS);
  const end = new Date(start.getTime() + DAY_MS);

  // Date.UTC 는 2026-02-31 같은 값을 조용히 3월로 굴린다. 굴러갔다는 것은
  // 애초에 없는 날짜였다는 뜻이므로 여기서 잡는다.
  if (dayKeyOf(start) !== day) throw new RollupError(`없는 날짜입니다: ${day}`);

  return { day, start, end };
}

/** 그 날짜의 다음 날 */
export function nextDay(day: DayKey): DayKey {
  return dayKeyOf(new Date(dayWindow(day).end.getTime()));
}

/**
 * 지금 기준으로 이미 끝난 하루인가.
 *
 * **진행 중인 오늘은 절대 접지 않는다.** 접어 두고 원본을 지우면 그날 남은
 * 시간의 이벤트가 어디에도 안 남는다. 하루가 완전히 끝난 뒤에만 센다.
 */
export function isClosedDay(day: DayKey, now: Date): boolean {
  return now.getTime() >= dayWindow(day).end.getTime();
}

/**
 * 이번 배치가 접을 날들.
 *
 * 마지막으로 접은 날 다음부터 어제까지를 순서대로 돌려준다. 한 번도 접은
 * 적이 없으면 가장 오래된 이벤트가 있는 날부터 시작한다.
 *
 * 순서대로 돌려주는 것이 중요하다. 중간을 건너뛰고 접으면 "접은 날" 의
 * 연속성이 깨져서, 어디까지 안전하게 지울 수 있는지 알 수 없게 된다.
 */
export function daysToRollUp(input: {
  /** 마지막으로 접은 날. 없으면 null */
  readonly lastRolledUp: DayKey | null;
  /** 가장 오래된 원본 이벤트의 날. 원본이 없으면 null */
  readonly oldestRaw: DayKey | null;
  readonly now: Date;
  readonly maxDays?: number;
}): DayKey[] {
  const start = input.lastRolledUp === null ? input.oldestRaw : nextDay(input.lastRolledUp);
  if (start === null) return [];

  const limit = input.maxDays ?? MAX_DAYS_PER_RUN;
  const days: DayKey[] = [];

  let cursor = start;
  while (days.length < limit && isClosedDay(cursor, input.now)) {
    days.push(cursor);
    cursor = nextDay(cursor);
  }

  return days;
}

/**
 * 원본을 지워도 되는 마지막 날 (이 날짜까지 포함해서 삭제).
 *
 * 두 조건을 **모두** 넘긴 날만 지운다.
 * 1. 보존 기간이 지났다
 * 2. 그날이 이미 접혀 있다
 *
 * 2번이 핵심이다. 보존 기간만 보고 지우면, 롤업이 며칠 고장 나 있는 사이에
 * 배치가 원본을 지워 버린다. 그러면 그 기간의 지표는 원본도 집계도 없이
 * 영영 사라진다 — 되돌릴 방법이 없는 종류의 사고다.
 *
 * 접힌 날까지만 지우므로, 롤업이 멈추면 삭제도 함께 멈춘다. 테이블이 커지는
 * 것은 눈에 보이는 문제이고, 데이터가 사라지는 것은 보이지 않는 문제다.
 * 보이는 쪽으로 실패하게 둔다.
 */
export function deletableThrough(input: {
  readonly lastRolledUp: DayKey | null;
  readonly now: Date;
  readonly retentionDays?: number;
}): DayKey | null {
  if (input.lastRolledUp === null) return null;

  const retention = input.retentionDays ?? RAW_RETENTION_DAYS;
  const cutoff = dayKeyOf(new Date(input.now.getTime() - retention * DAY_MS));

  // 보존 경계와 롤업 진행선 중 **더 이른 쪽**. 둘 다 만족해야 한다.
  return input.lastRolledUp < cutoff ? input.lastRolledUp : cutoff;
}

// ── 집계 결과 ────────────────────────────────────────────────

export interface DailyEventCount {
  readonly day: DayKey;
  readonly name: string;
  /** 이벤트 수. **날짜끼리 더해도 된다.** */
  readonly events: number;
  /**
   * 그날의 고유 세션 수.
   *
   * **날짜끼리 더하면 안 된다.** 이틀에 걸쳐 온 사람은 양쪽에 한 번씩 세어져
   * 있어서, 더하면 실제 사람 수보다 많아진다. 주간 고유 세션이 필요하면
   * 원본에서 다시 세야 한다 — 그래서 원본 보존 기간이 필요하다.
   */
  readonly sessions: number;
  /** 그날의 고유 로그인 사용자 수. 세션과 같은 이유로 더하면 안 된다. */
  readonly users: number;
  /** 금액 합계(원). purchase·refund 에만 채워진다. 더해도 된다. */
  readonly value: number;
  /** 수량 합계. 더해도 된다. */
  readonly quantity: number;
}

/**
 * 하루치 퍼널.
 *
 * `computeFunnel` 과 같은 strict 정의를 쓴다 — 앞 단계를 모두 거친 세션만
 * 다음 단계로 센다. 그래서 이 값은 `DailyEventCount.sessions` 와 다르다.
 * 이름별 세션 수만 접어 두면 strict 퍼널을 되살릴 수 없어서 따로 남긴다.
 */
export interface DailyFunnelStep {
  readonly day: DayKey;
  readonly step: string;
  readonly sessions: number;
}
