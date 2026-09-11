import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 운영진이 무언가를 바꾸면 **누가 무엇을 했는지 남는다.**
 *
 * 권한을 네 층으로 나눠 놓고 기록을 안 남기면 절반만 한 것이다. 환불·권한
 * 부여·입점 승인 같은 동작은 되돌릴 수 없고 돈이 걸려 있는데, 나중에
 * "누가 그랬나" 를 물으면 답할 것이 없다.
 *
 * 지금은 `/api/admin` 아래 쓰기 창구 **전부**가 감사 로그에 닿는다. 예외가
 * 하나도 없다 — 그래서 지금이 못 박아 두기 가장 싼 때다. 새 창구를 만드는
 * 가장 흔한 방법은 옆 파일을 복사하는 것이고, 가장 흔한 실수는 기록을
 * 통째로 빠뜨리는 것이다. 빠뜨려도 화면은 멀쩡히 동작하므로 **아무도 모른다.**
 *
 * **목록을 손으로 적지 않는다.** 폴더를 읽어 쓰기 메서드를 내보내는 파일을
 * 직접 찾는다. 새 창구가 생겨도 여기서 걸린다.
 *
 * **한계를 적어 둔다.** 이 검사는 "감사 로그에 **닿을 수 있는가**" 를 본다.
 * 창구가 기록하는 모듈을 가져다 쓰면서 정작 기록 안 하는 함수만 부르면
 * 통과한다. 호출 그래프를 따라가면 잡히지만 그건 이 검사가 감당할 무게가
 * 아니다. 잡으려는 것은 **통째로 빠뜨린 경우**다.
 */

const SRC = join(process.cwd(), 'src');
const ADMIN_API = join(SRC, 'app', 'api', 'admin');

/** 상태를 바꾸는 메서드 */
const WRITE = ['POST', 'PATCH', 'PUT', 'DELETE'] as const;

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return entry.name === 'route.ts' ? [full] : [];
  });
}

/** `~/lib/...` 를 실제 파일로 바꾼다 */
function resolveLib(specifier: string): string | null {
  const base = join(SRC, specifier.slice('~/'.length));
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * 이 파일에서 출발해 감사 로그에 닿는가.
 *
 * 창구가 직접 남기기도 하고(`route.ts` 에서 `recordAudit`), 일을 맡은
 * 모듈이 남기기도 한다(`manage-support.ts` 처럼). **둘 다 옳다** — 기록은
 * 쓰기 옆에 붙어 있으면 되고, 그 자리가 어디인지는 창구마다 다르다.
 * 창구만 뒤지면 lib 에서 남기는 쪽을 못 남긴다고 잘못 읽는다.
 */
function reachesAudit(file: string, seen = new Set<string>(), depth = 0): boolean {
  if (seen.has(file) || depth > 3) return false;
  seen.add(file);

  const source = readFileSync(file, 'utf8');
  if (source.includes('recordAudit')) return true;

  for (const match of source.matchAll(/from '(~\/lib\/[^']+)'/g)) {
    const specifier = match[1];
    if (specifier === undefined) continue;
    const target = resolveLib(specifier);
    if (target && reachesAudit(target, seen, depth + 1)) return true;
  }
  return false;
}

const writers = routeFiles(ADMIN_API)
  .map((file) => ({
    file,
    rel: file.slice(SRC.length + 1),
    methods: WRITE.filter((m) => new RegExp(`export async function ${m}\\b`).test(readFileSync(file, 'utf8'))),
  }))
  .filter((r) => r.methods.length > 0);

describe('운영진의 쓰기는 전부 감사 로그에 닿는다', () => {
  it('쓰기 창구를 실제로 찾아낸다 — 못 찾으면 이 검사는 아무것도 지키지 못한다', () => {
    /*
     * **상한만 있는 검사는 자기가 눈을 감았는지 모른다.** 정규식이나 경로가
     * 어긋나 목록이 비면 아래 검사는 통과할 것이 없어서 전부 통과한다.
     */
    expect(writers.length, '어드민 쓰기 창구를 하나도 못 찾았다').toBeGreaterThan(20);
    expect(writers.some((w) => w.rel.includes('users'))).toBe(true);
    expect(writers.some((w) => w.rel.includes('settlements'))).toBe(true);
  });

  it.each(writers.map((w) => [w.rel, w.methods.join('·')] as const))(
    '%s (%s)',
    (rel) => {
      const writer = writers.find((w) => w.rel === rel)!;
      expect(
        reachesAudit(writer.file),
        `${rel} 이 감사 로그를 남기지 않는다. 창구에서 recordAudit 을 부르거나, 일을 맡은 lib 모듈에서 남겨야 한다.`,
      ).toBe(true);
    },
  );

  it('창구가 아니라 lib 에서 남기는 쪽도 읽어 낸다', () => {
    /*
     * 따라가기가 고장 나면 이 검사만 지고 나머지는 통과한다 — 대부분의
     * 창구는 자기 파일에서 직접 남기기 때문이다. 그 한 갈래를 따로 잡아 둔다.
     */
    const support = writers.find((w) => w.rel.includes('support') && !w.rel.includes('['));
    expect(support, 'support 창구를 못 찾았다').toBeDefined();
    expect(
      readFileSync(support!.file, 'utf8').includes('recordAudit'),
      'support 창구가 직접 남기게 바뀌었다면 이 검사는 더 이상 따라가기를 확인하지 않는다',
    ).toBe(false);
    expect(reachesAudit(support!.file)).toBe(true);
  });
});

describe('감사 로그를 읽는 창구', () => {
  it('lib/audit.ts 가 행위자의 그때 역할을 함께 남긴다', () => {
    /*
     * 역할은 나중에 바뀐다. 조인해서 읽으면 "그때 무슨 권한으로 했는지" 가
     * 아니라 "지금 무슨 권한인지" 가 나온다 — 주문 스냅샷과 같은 이유로
     * 박아 둬야 한다.
     */
    const audit = readFileSync(join(SRC, 'lib', 'audit.ts'), 'utf8');
    expect(audit).toContain('actorRole');
  });
});
