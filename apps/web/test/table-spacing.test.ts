import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * 표의 칸 사이가 붙지 않게 지킨다.
 *
 * **눈으로는 잘 안 걸린다.** 칸이 좁을 때는 붙어 있어도 그럭저럭 읽히다가,
 * 숫자가 길어지는 순간 "−29,700168,300" 처럼 두 값이 한 덩어리가 된다.
 * 정산 금액에서 그러면 읽는 사람이 값을 잘못 안다 — 실제로 그 상태였다.
 *
 * 저장소에 표가 열넷 있는데 여섯은 칸마다 px 를 적었고 여덟은 빠뜨렸다.
 * 손으로 적는 한 또 빠진다. 둘 중 하나를 쓰게 하고, 새 표가 어느 쪽도
 * 쓰지 않으면 여기서 진다.
 */

const SRC = join(process.cwd(), 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return name.endsWith('.tsx') ? [full] : [];
  });
}

/** `<table …>` 하나와 그 뒤 머리글 줄까지 */
const TABLE = /<table([^>]*)>([\s\S]{0,1200}?)<\/thead>/g;

describe('표의 칸 사이 여백', () => {
  it('모든 표가 칸 사이를 벌린다', () => {
    const offenders: string[] = [];

    for (const file of walk(SRC)) {
      const source = readFileSync(file, 'utf8');
      for (const m of source.matchAll(TABLE)) {
        const [, attrs = '', head = ''] = m;
        // 눈에 보이지 않는 표는 여백이 뜻이 없다. 그림의 대체 표가 그렇다.
        if (attrs.includes('sr-only')) continue;
        // 카드 안에 사는 표는 공용 규칙을, 밖에 사는 표는 칸마다 px 를 쓴다
        const shared = attrs.includes('data-table');
        const perCell = /className="[^"]*\bpx-\d/.test(head);
        if (!shared && !perCell) offenders.push(relative(SRC, file));
      }
    }

    expect([...new Set(offenders)]).toEqual([]);
  });

  it('머리글은 정렬을 스스로 밝힌다 — th 의 기본은 가운데다', () => {
    /*
     * th 는 기본이 가운데 정렬인데 아래 td 는 대개 왼쪽이다. 칸이 좁을
     * 때는 둘이 비슷해 보이다가, 표가 넓어지는 순간 머리글만 허공에 뜬다.
     */
    const offenders: string[] = [];
    const aligned = /\btext-(left|right|center)\b/;

    for (const file of walk(SRC)) {
      const source = readFileSync(file, 'utf8');
      for (const head of source.matchAll(/<thead>([\s\S]*?)<\/thead>/g)) {
        const block = head[1] ?? '';
        // 정렬을 머리글 줄에 한 번 걸어 둔 표도 있다. 그것도 밝힌 것이다.
        const row = /<tr[^>]*className="([^"]*)"/.exec(block)?.[1] ?? '';
        if (aligned.test(row)) continue;

        for (const th of block.matchAll(/<th scope="col" className="([^"]*)"/g)) {
          const cls = th[1] ?? '';
          if (!aligned.test(cls)) offenders.push(`${relative(SRC, file)} — ${cls}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
