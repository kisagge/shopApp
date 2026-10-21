import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * **모든 요청이 지나는 자리에 무엇이 실려 있는가.**
 *
 * 이 저장소의 엣지 런타임은 `src/proxy.ts` 가 쓴다 — 요청마다 새 nonce 로 CSP 를 붙이는
 * 자리라 `_next` 아래를 뺀 **모든 요청**을 지난다. 거기 실리는 무게는 조용히 비싸다.
 *
 * 그런데 엣지 묶음이 **11MB** 였다. 그중 4.4MB 는 Prisma 의 WASM 질의 컴파일러를 base64 로
 * 박아 둔 덩이다(`…query_compiler…wasm-base64…`). 엣지에서는 돌지도 못하는 코드다 —
 * 빌드 로그에 `Ecmascript file had an error … Edge Instrumentation` 이 세 번 찍히고 있었고,
 * 빌드는 그래도 성공해서 아무도 멈추지 않았다.
 *
 * 들어온 길: `instrumentation.ts` 의 `onRequestError` 가 보고 코드를 **동적 임포트**로
 * 미뤄 두었는데, 미루는 것만으로는 번들에서 빠지지 않는다 — 묶는 쪽은 부를 수도 있는 길을
 * 다 싣는다. `NEXT_RUNTIME` 으로 엣지에서는 아예 돌아가지 않게 하니 **104KB** 가 됐다.
 *
 * 소스가 아니라 **빌드 결과**를 본다. 사전 검사와 같은 까닭이고, 그래서 빌드가 검사보다
 * 먼저 돌아야 한다(`test/ci-order.test.ts` 가 그 순서를 지킨다).
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const WEB = join(ROOT, 'apps/web');
const EDGE = join(WEB, process.env['NEXT_DIST_DIR'] ?? '.next', 'server/edge');

/** 엣지 묶음의 모든 .js 를 모은다 */
function edgeFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) edgeFiles(path, out);
    else if (entry.name.endsWith('.js')) out.push(path);
  }
  return out;
}

describe('엣지 묶음', () => {
  const built = existsSync(EDGE);

  it.runIf(built)('Prisma 가 실리지 않는다 — 엣지에서는 돌지도 못한다', () => {
    const carriers = edgeFiles(EDGE).filter((f) => {
      // 파일 이름에 박히기도 하고(청크 이름), 내용에 들어가기도 한다
      if (/prisma/i.test(f)) return true;
      return /@prisma\/client|PrismaClient/.test(readFileSync(f, 'utf8'));
    });

    expect(carriers.map((f) => f.slice(EDGE.length + 1))).toEqual([]);
  });

  it.runIf(built)('요청마다 지나는 자리가 가볍다', () => {
    /*
     * 11MB 가 104KB 가 됐다. 정확한 숫자를 못 박으면 다시 불어나도 아무도 모르므로
     * 넉넉한 상한을 둔다 — 지금의 열 배다. 이 선을 넘었다면 무엇이 들어왔는지 봐야 한다.
     */
    const total = edgeFiles(EDGE).reduce((sum, f) => sum + statSync(f).size, 0);
    expect(total / 1024 / 1024).toBeLessThan(1);
  });

  it('엣지에서는 보고 코드를 부르지 않는다', () => {
    /*
     * 빌드 결과가 없을 때도 이것만은 본다. 동적 임포트만으로는 빠지지 않는다는 것이
     * 이 자리의 교훈이라, 가드가 **임포트보다 먼저** 있어야 한다.
     */
    const source = readFileSync(join(WEB, 'instrumentation.ts'), 'utf8');
    const guard = source.indexOf("process.env['NEXT_RUNTIME'] !== 'nodejs'");
    const load = source.indexOf("import('~/lib/errors')");

    expect(guard, '엣지를 걸러 내는 줄이 없다').toBeGreaterThan(-1);
    expect(load, '보고 코드를 가져오는 줄이 없다').toBeGreaterThan(-1);
    expect(guard, '가드가 임포트 뒤에 있으면 묶는 쪽이 길을 다 싣는다').toBeLessThan(load);
  });
});
