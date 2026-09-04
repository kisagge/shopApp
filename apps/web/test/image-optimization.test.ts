import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * 이미지가 최적화를 거치는지 지킨다.
 *
 * **`<img>` 를 하나 쓰는 것은 눈에 띄지 않는다.** 화면은 똑같이 나오고,
 * 개발용 이미지는 작아서 티도 안 난다. 실제 사진이 들어온 뒤 목록 화면에서
 * 원본 수십 장이 그대로 나가고 나서야 알게 된다.
 */

const SRC = join(process.cwd(), 'src');

/**
 * next/image 를 쓸 수 없는 자리.
 *
 * 주소가 blob: 이라 브라우저 안에만 있고 서버가 가져올 수 없다. 목록에서
 * 빼는 것이 아니라 **왜 예외인지 적어 두는** 것이 목적이다.
 */
const RAW_IMG_ALLOWED = ['app/mypage/reviews/review-form.tsx'] as const;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx$/.test(name)) out.push(full);
  }
  return out;
}

describe('원본 이미지가 그대로 나가지 않는다', () => {
  it('허용한 자리 말고는 <img> 를 쓰지 않는다', () => {
    const offenders = walk(SRC)
      .filter((file) => /<img[\s>]/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file))
      .filter((rel) => !(RAW_IMG_ALLOWED as readonly string[]).includes(rel));

    expect(offenders).toEqual([]);
  });

  it('예외로 둔 자리는 실제로 남아 있다', () => {
    // 파일이 사라졌는데 목록만 남으면 다음 사람이 왜 있는지 알 수 없다
    for (const rel of RAW_IMG_ALLOWED) {
      const source = readFileSync(join(SRC, rel), 'utf8');
      expect(source, rel).toMatch(/<img[\s>]/);
      // 왜 예외인지 옆에 적혀 있어야 한다
      expect(source, rel).toContain('blob:');
    }
  });

  it('fill 로 그리는 이미지에는 sizes 가 있다', () => {
    /*
     * fill 은 크기를 부모에서 받으므로 next/image 가 표시 폭을 알 수 없다.
     * sizes 가 없으면 가장 큰 파일을 내려보내서 최적화가 헛돈다.
     */
    for (const file of walk(SRC)) {
      const source = readFileSync(file, 'utf8');
      const blocks = source.match(/<(?:Image|NextImage)\b[^>]*?\bfill\b[^>]*?>/gs) ?? [];
      for (const block of blocks) {
        expect(block, relative(SRC, file)).toMatch(/\bsizes[=\s]/);
      }
    }
  });
});
