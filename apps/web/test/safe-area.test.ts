import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 앱에서 맨 위에 붙는 것은 **상태바 자리를 비우고, 그 자리를 어둡게 칠하지 않는다.**
 *
 * 웹뷰는 화면 맨 위(시계·배터리·카메라 구멍 밑)부터 그린다. 브라우저에서는 주소창이 가려 주던
 * 자리라 눈으로는 안 보이고, 앱을 기기에서 띄워야 겹친 것이 보인다. 운영 화면을 매장에서 떼어
 * 내면서 매장 머리의 safe-t 는 남고 운영 머리띠·서랍에서만 빠졌다 — 앱에서 확인하다 찾았다.
 *
 * 자리를 비운 다음에도 한 번 더 걸렸다. 운영 머리띠는 그 자리까지 **어두운 면으로** 덮고 있었는데,
 * iOS 는 상태바 글자색을 앱의 밝기 설정으로 정하고 웹은 그것을 못 고친다 — 밝은 모드에서는 검은
 * 글자라 검정 위 검정이 되어 시계와 배터리가 안 보였다. 그래서 상태바 자리는 **화면 바탕색**으로
 * 두고 어두운 띠는 그 아래에서 시작한다.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), 'src', rel), 'utf8');

const TOP_BARS: readonly { file: string; what: string; pattern: RegExp }[] = [
  { file: 'components/site-header.tsx', what: '매장 머리', pattern: /<header className="[^"]*\bsafe-t\b/ },
  // 머리띠가 상태바 자리까지 화면 바탕색으로 덮는다 — 어둡게 칠하면 밝은 모드의 검은 글자가 묻힌다
  {
    file: 'components/admin/admin-nav.tsx',
    what: '운영 머리띠',
    pattern: /className="safe-t fixed inset-x-0 top-0[^"]*bg-\[var\(--bg\)\]/,
  },
  // 고정한 만큼 자리를 비운다. box-content 라야 안전영역이 h-14 안으로 먹히지 않는다
  { file: 'components/admin/admin-nav.tsx', what: '머리띠가 비운 자리', pattern: /className="safe-t box-content h-14/ },
  { file: 'components/admin/admin-nav.tsx', what: '운영 서랍', pattern: /env\(safe-area-inset-top/ },
];

describe('상태바 자리', () => {
  it.each(TOP_BARS)('$what 이 상태바 밑으로 들어가지 않는다', ({ file, pattern }) => {
    expect(read(file)).toMatch(pattern);
  });

  it('상태바 자리를 어두운 면으로 덮지 않는다', () => {
    /*
     * 같은 칸에 safe-t 와 어두운 바탕을 함께 주면 그 자리가 통째로 검어진다 — 밝은 모드의
     * 검은 상태바 글자가 묻힌다. 눈으로는 앱에서만 보이는 실수라 여기서 막는다.
     */
    expect(read('components/admin/admin-nav.tsx')).not.toMatch(/className="[^"]*\bsafe-t\b[^"]*bg-dark-bg/);
  });

  it('safe-t 가 실제로 상태바 높이만큼 민다', () => {
    const css = readFileSync(join(process.cwd(), '..', '..', 'packages/ui/src/styles/theme.css'), 'utf8');
    expect(css).toMatch(/\.safe-t\s*\{\s*padding-top:\s*env\(safe-area-inset-top/);
  });
});
