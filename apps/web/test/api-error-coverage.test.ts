import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 라우트의 말미는 한 곳에서 만든다.
 *
 * **왜 이 검사가 생겼는가.** 도메인 오류 클래스가 서른아홉인데 전부 같은 모양
 * (`code`·`message`·`status`)이고, 그것을 응답으로 옮기는 여섯 줄이 라우트마다
 * 복사돼 있었다. 새 도메인 오류를 하나 더하면 그것을 던지는 라우트도 함께 고쳐야
 * 했고, 어떤 라우트는 권한 오류를 403 으로 옮기는 것을 잊어 500 이 나갔다.
 *
 * **더 실을 것이 있는 말미는 그대로 둔다.** 결제 오류의 `retryable`, 메일 템플릿의
 * `problems`, 내려받기가 413 으로 내보내는 상한 초과 — 이런 것은 그 라우트만 아는
 * 사정이다. 이 검사가 막는 것은 **더 실을 것이 없는데도 손으로 적은 말미**다.
 */
const API = join(process.cwd(), 'src', 'app', 'api');

function walk(dir: string, prefix = ''): { name: string; source: string }[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full, `${prefix}${entry}/`);
    return entry === 'route.ts'
      ? [{ name: `${prefix}${entry}`, source: readFileSync(full, 'utf8') }]
      : [];
  });
}

/** 정규식에 넣을 수 있게 특수문자를 막는다 */
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `} catch (error) { … }` 한 덩어리씩 */
const catches = (source: string) => [...source.matchAll(/\} catch \(error\) \{\n(.*?)\n {2}\}/gs)].map((m) => m[1]!);

/** 도메인 오류를 그대로 옮기는 정형 가지 — 이것만으로 이루어진 말미는 apiError 가 대신할 수 있다 */
const MOVES_IT_ALONG = 'return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });';
const PLAIN_BRANCH = new RegExp(
  `^ {4}if \\(error instanceof \\w+\\) (?:\\{\\n {6}${escape(MOVES_IT_ALONG)}\\n {4}\\}|${escape(MOVES_IT_ALONG)})\\n`,
  'm',
);

const FORBIDDEN_BRANCH = new RegExp(
  '^ {4}if \\(error instanceof ForbiddenError\\) (?:\\{\\n {6}return await forbidden\\(\\);\\n {4}\\}|return await forbidden\\(\\);)\\n',
  'm',
);

const routes = walk(API);

describe('라우트 말미', () => {
  it('라우트를 실제로 읽었다 — 못 읽으면 아래가 전부 헛돈다', () => {
    expect(routes.length).toBeGreaterThan(50);
    expect(routes.some((r) => r.source.includes('apiError(error)'))).toBe(true);
  });

  it('더 실을 것이 없는 말미를 손으로 적은 라우트가 없다', () => {
    const offenders = routes
      .filter((route) =>
        catches(route.source).some((body) => {
          let rest = `${body}\n`;
          if (!rest.includes('instanceof')) return false;
          for (const branch of [PLAIN_BRANCH, FORBIDDEN_BRANCH]) {
            let hit = true;
            while (hit) {
              const next = rest.replace(branch, '');
              hit = next !== rest;
              rest = next;
            }
          }
          return rest.trim() === 'throw error;';
        }),
      )
      .map((route) => route.name);

    expect(
      offenders,
      `말미를 손으로 적었다:\n${offenders.join('\n')}\n` +
        'respond.ts 의 apiError(error) 로 끝내면 된다 — 도메인 오류가 하나 늘어도 라우트는 안 고친다.',
    ).toEqual([]);
  });
});
