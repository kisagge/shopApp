import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 배치가 인증을 걸고, **실제로 돌도록 등록돼 있는지** 지킨다.
 *
 * 등록을 빠뜨리는 것은 조용히 지나가는 실수다. 라우트는 멀쩡히 있고
 * 테스트도 통과하는데 아무도 부르지 않아서, 배포한 뒤 몇 주가 지나서야
 * "왜 안 돌지" 가 된다. 결제 대기 주문을 푸는 배치가 그렇게 잠들면
 * **재고가 계속 묶인다** — 이 배치를 만든 이유가 그것이다.
 *
 * 요청 제한과 캐시 무효화를 목록으로 지킨 것과 같은 자리다.
 */

const CRON_DIR = join(process.cwd(), 'src', 'app', 'api', 'cron');
const routes = readdirSync(CRON_DIR).filter((name) => !name.startsWith('.'));

const vercel = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as {
  crons?: { path: string; schedule: string }[];
};
const scheduled = new Map((vercel.crons ?? []).map((c) => [c.path, c.schedule]));

describe('배치', () => {
  it('하나 이상 있다 — 목록이 비면 아래 검사가 전부 헛돈다', () => {
    expect(routes.length).toBeGreaterThan(0);
  });

  it.each(routes)('%s 가 인증을 건다', (name) => {
    const source = readFileSync(join(CRON_DIR, name, 'route.ts'), 'utf8');
    expect(source).toContain('authorizeCron');
  });

  it.each(routes)('%s 가 vercel.json 에 등록돼 있다', (name) => {
    expect(scheduled.has(`/api/cron/${name}`)).toBe(true);
  });

  it('등록된 배치는 전부 실제로 있다 — 지운 뒤 남은 줄은 매일 404 를 부른다', () => {
    const known = new Set(routes.map((name) => `/api/cron/${name}`));
    expect([...scheduled.keys()].filter((path) => !known.has(path))).toEqual([]);
  });

  it.each([...scheduled])('%s 의 주기가 크론 표현식이다', (_path, schedule) => {
    expect(schedule.trim().split(/\s+/)).toHaveLength(5);
  });
});

/**
 * 함수 리전.
 *
 * **문서와 설정이 어긋난 채로 굳어 있었다.** DEPLOY.md 는 "리전은 icn1(서울)에
 * 맞춘다" 고 적었는데 Neon 에는 서울 리전이 없다 — 따를 수 없는 지시였다.
 * 그래서 DB 는 싱가포르에 놓이고 vercel.json 은 서울을 가리켰다. 아무 데도
 * 가깝지 않으면서 양쪽 거리를 다 치르는 상태다. 기기에서 재 보니 DB 왕복
 * 하나가 141ms 였고(질의 내용과 무관하게 고정), 주문 하나에 그 왕복을
 * 열 번 넘게 쓴다.
 *
 * 리전은 코드가 아니라 배포 설정이라 검사가 값을 확인할 수는 없다. 대신
 * **설정과 문서가 같은 곳을 가리키는지**를 본다 — 어긋나는 것이 문제였으므로
 * 어긋남을 잡는 것이 맞다.
 */
describe('함수 리전', () => {
  const region = (vercel as { regions?: string[] }).regions ?? [];

  it('한 곳으로 고정한다 — 비워 두면 배포마다 달라진다', () => {
    expect(region).toHaveLength(1);
  });

  /**
   * **이름이 문서 어딘가에 있는지만 보면 안 된다.** 옛 리전은 "예전에는 이랬다"
   * 는 설명으로 문서에 계속 남으므로, 그런 검사는 어느 리전이든 통과한다 —
   * 눈을 감고 통과하는 검사가 된다. 그래서 **지시 문장**이 어디를 가리키는지 본다.
   */
  it('DEPLOY.md 의 지시가 같은 곳을 가리킨다', () => {
    const doc = readFileSync(join(process.cwd(), '..', '..', 'docs', 'DEPLOY.md'), 'utf8');
    expect(doc, `vercel.json 은 ${region[0]} 인데 DEPLOY.md 는 그렇게 하라고 말하지 않는다`)
      .toMatch(new RegExp('`' + region[0] + '`[^\\n]{0,20}(에 맞춘다|으로 맞춘다|로 둔다|에 둔다)'));
  });

  /**
   * 다른 리전 이름이 문서에 남아 있으면 다음 사람이 그것을 따라간다 —
   * 실제로 `icn1` 이 그렇게 남아 지시가 됐다.
   */
  it('예전 리전 이름이 지시로 남아 있지 않다', () => {
    const doc = readFileSync(join(process.cwd(), '..', '..', 'docs', 'DEPLOY.md'), 'utf8');
    const others = ['icn1', 'iad1', 'hnd1', 'sin1'].filter((r) => r !== region[0]);
    for (const r of others) {
      // 옛일을 설명하는 문장에는 나올 수 있다. 지시로 읽히는 자리만 막는다
      expect(doc, `${r} 이 "맞춘다" 는 지시로 남아 있다`).not.toMatch(
        new RegExp(`\`${r}\`[^\n]{0,20}(에 맞춘다|으로 맞춘다|로 둔다)`),
      );
    }
  });
});

/**
 * 문서에 적힌 시각이 실제 주기와 같은가.
 *
 * **손으로 적은 표는 조용히 어긋난다.** DEPLOY.md 의 배치 표는 세 가지가
 * 틀려 있었다 — "두 개가 정의돼 있다" 면서 여섯 개 중 넷만 적혀 있었고,
 * 정산은 "매달 1일 KST 05:00" 이라고 했는데 실제로는 2일이었다.
 *
 * 마지막 것이 특히 조용하다. 크론 표현식은 **UTC 로 읽히는데** 표는 KST 로
 * 적혀 있어서, 9시간을 더하다 날짜가 넘어가는 것을 사람이 놓치기 쉽다.
 * 매일 도는 배치는 날짜가 넘어가도 티가 안 나지만, **달에 한 번 도는 정산은
 * 날짜가 곧 의미**다.
 *
 * 그래서 표를 읽지 않고 `vercel.json` 에서 계산해 맞춰 본다.
 */
/** UTC 크론 표현식을 문서·주석이 쓰는 KST 문장으로 바꾼다 — 표도 주석도 같은 계산을 본다 */
function kstLabel(schedule: string): string {
  const [min, hour, dayOfMonth] = schedule.split(/\s+/) as [string, string, string];
  const shifted = Number(hour) + 9;
  const kstHour = shifted % 24;
  const time = `KST ${String(kstHour).padStart(2, '0')}:${String(Number(min)).padStart(2, '0')}`;
  if (dayOfMonth === '*') return `매일 ${time}`;
  // 9시간을 더하다 자정을 넘으면 날짜도 하루 넘어간다 — 정산이 그 경우다
  const day = Number(dayOfMonth) + (shifted >= 24 ? 1 : 0);
  return `매달 ${day}일 ${time}`;
}

describe('배치 시각이 문서와 같다', () => {
  const doc = () => readFileSync(join(process.cwd(), '..', '..', 'docs', 'DEPLOY.md'), 'utf8');

  it.each([...scheduled])('%s 의 시각이 문서에 그대로 적혀 있다', (path, schedule) => {
    const row = `| \`${path}\` | ${kstLabel(schedule)} |`;
    expect(doc(), `${path} 은 ${schedule}(UTC) 이라 ${kstLabel(schedule)} 인데 표가 다르다`)
      .toContain(row);
  });

  it('표에 적힌 배치 수가 실제와 같다', () => {
    const rows = doc().match(/\| `\/api\/cron\/[a-z-]+` \|/g) ?? [];
    expect(rows).toHaveLength(scheduled.size);
  });

  /**
   * **표는 맞는데 그 위의 문장이 틀려 있었다.** "여섯 개가 정의돼 있다" 고 적힌 채 일곱 줄이 서 있었다 —
   * 줄 수만 세는 검사는 그 문장을 보지 못한다. 숫자도 vercel.json 에서 세어 맞춘다.
   */
  it('문장에 적힌 배치 수도 실제와 같다', () => {
    const KOREAN = ['하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉', '열'];
    const said = doc().match(/vercel\.json` 에 (\S+) 개가 정의돼 있다/)?.[1];
    expect(said, 'DEPLOY.md 가 배치 개수를 말하지 않는다').toBeTruthy();
    expect(said, `배치는 ${scheduled.size}개다`).toBe(KOREAN[scheduled.size - 1]);
  });
});

/**
 * 라우트 주석에 적힌 시각이 실제 주기와 같은가.
 *
 * **표는 검사가 지키는데 주석은 아무도 안 봤다.** 그 사이 셋이 어긋났다 — 소멸 배치는 주석에 04:00 이라 적힌 채
 * 02:00 에 돌고 있었고(옮긴 날 주석만 남았다), 정산은 "매달 1일" 이라 적혀 있었지만 실제로는 2일이며(DEPLOY.md 는
 * 이미 고쳤다), 알림 배치는 "소멸 배치(04:00)가 먼저 돌아" 라는 근거를 옛 시각으로 적고 있었다.
 *
 * 주석의 시각은 **읽는 사람이 순서를 따지는 근거**다: 소멸이 대사보다 먼저 도는가, 알림이 소멸 뒤에 오는가.
 * 근거가 틀리면 그 위에 쌓은 판단도 틀린다. 그래서 주석도 vercel.json 에서 계산해 맞춘다.
 */
describe('배치 주석이 실제 주기와 같다', () => {
  /**
   * 크론 표현식의 UTC 시각 — 주석이 괄호 안에 적어 두는 값이다.
   *
   * 사이에 날짜가 끼는 것을 허락한다("UTC 1일 20:00"): 달에 한 번 도는 정산은 UTC 날짜가 곧 의미다.
   */
  function utcTime(schedule: string): RegExp {
    const [min, hour] = schedule.split(/\s+/) as [string, string];
    const hh = String(Number(hour)).padStart(2, '0');
    const mm = String(Number(min)).padStart(2, '0');
    return new RegExp(`UTC (\\d+일 )?${hh}:${mm}`);
  }

  const source = (path: string) =>
    readFileSync(join(CRON_DIR, path.replace('/api/cron/', ''), 'route.ts'), 'utf8');

  it.each([...scheduled])('%s 가 자기 시각을 적어 둔다', (path, schedule) => {
    const head = source(path).split('export async function')[0] ?? '';

    expect(head, `${path} 주석에 "${kstLabel(schedule)}" 이 없다 — 언제 도는지 적어 둔다`)
      .toContain(kstLabel(schedule));
    // UTC 값까지 적는다. 크론 표현식이 UTC 로 읽힌다는 것을 잊으면 9시간이 조용히 어긋난다
    expect(head, `${path} 주석의 UTC 시각이 ${schedule}(UTC) 와 다르다`).toMatch(utcTime(schedule));
  });

  /**
   * **남의 배치 시각은 여기 옮겨 적지 않는다.**
   *
   * 알림 배치가 "소멸 배치(04:00)가 먼저 돌아" 라는 근거를 적어 둔 사이 소멸은 02:00 으로 옮겨 갔다. 옮겨 적은
   * 값은 원본이 움직여도 따라오지 않는다 — 그리고 이런 문장은 순서를 따지는 **근거**라 틀리면 그 위에 쌓은
   * 판단까지 틀린다. 가리킬 때는 이름으로 가리키면 된다("소멸 배치가 먼저 돌아"): 이름은 안 낡는다.
   *
   * 자기 시각은 위 검사가 vercel.json 과 맞추므로 여기서 걸리지 않는다.
   */
  it.each([...scheduled])('%s 주석이 남의 배치 시각을 옮겨 적지 않는다', (path, schedule) => {
    const head = source(path).split('export async function')[0] ?? '';
    const mine = kstLabel(schedule).replace(/^.*KST /, '');

    const quoted = [...head.matchAll(/배치\s*\((\d{2}:\d{2})\)/g)].map(([, t]) => t!);
    expect(quoted.filter((t) => t !== mine), '남의 배치는 시각 말고 이름으로 가리킨다').toEqual([]);
  });
});

