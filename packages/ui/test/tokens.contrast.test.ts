// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseOklchTokens, contrastRatio } from './color';

const css = readFileSync(resolve(process.cwd(), 'src/styles/theme.css'), 'utf8');
const T = parseOklchTokens(css);

const AA_TEXT = 4.5;      // 본문 크기 텍스트
const AA_GRAPHIC = 3.0;   // UI 컴포넌트·그래픽 객체 (WCAG 1.4.11)

/**
 * 디자인 토큰이 접근성 기준을 만족하는지 값에서 직접 계산해 검증한다.
 * 손으로 확인하면 잊어버리고, 색을 한 단계 바꾸는 순간 조용히 깨진다.
 * 실제로 이 프로젝트에서 처음 잡았던 토큰 3개가 여기서 걸러졌다.
 */
describe('디자인 토큰 명도 대비 (라이트)', () => {
  const BG = () => T['n-0']!;

  it.each([
    ['본문 기본 (n-900)', 'n-900', AA_TEXT],
    ['본문 보조 (n-700)', 'n-700', AA_TEXT],
    ['캡션 (n-600)', 'n-600', AA_TEXT],
    ['약한 라벨 (n-500)', 'n-500', AA_TEXT],
    ['세일가 (accent)', 'accent', AA_TEXT],
    ['배송 정보 (info)', 'info', AA_TEXT],
    ['성공 (success)', 'success', AA_TEXT],
    ['경고 텍스트 (warning)', 'warning', AA_TEXT],
    ['경고 그래픽 (warning-graphic)', 'warning-graphic', AA_GRAPHIC],
    ['테두리 (n-300)', 'n-300', 1.0],
  ])('%s 는 배경 위에서 기준을 만족한다', (_label, token, min) => {
    const hex = T[token];
    expect(hex, `토큰 --color-${token} 을 theme.css에서 찾지 못했습니다`).toBeDefined();
    expect(contrastRatio(hex!, BG())).toBeGreaterThanOrEqual(min);
  });

  it('surface(n-50) 위에서도 본문·라벨이 기준을 지킨다', () => {
    // 카드·요약 박스 배경이라 여기서 깨지면 화면 절반이 미달이 된다
    expect(contrastRatio(T['n-900']!, T['n-50']!)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(T['n-500']!, T['n-50']!)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('accent 버튼 위의 흰 글씨가 기준을 지킨다', () => {
    expect(contrastRatio(T['n-0']!, T['accent']!)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('primary 버튼(n-900) 위의 글씨가 기준을 지킨다', () => {
    expect(contrastRatio(T['n-0']!, T['n-900']!)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('soft 배경 위의 같은 계열 텍스트가 읽힌다', () => {
    expect(contrastRatio(T['accent']!, T['accent-soft']!)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(T['info']!, T['info-soft']!)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(T['success']!, T['success-soft']!)).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe('디자인 토큰 명도 대비 (다크)', () => {
  it('다크 배경 위 본문·보조 텍스트가 기준을 지킨다', () => {
    expect(contrastRatio(T['dark-fg']!, T['dark-bg']!)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(T['dark-muted']!, T['dark-bg']!)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('다크 서페이스 위에서도 본문이 기준을 지킨다', () => {
    expect(contrastRatio(T['dark-fg']!, T['dark-surface']!)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('다크 accent 가 기준을 지킨다', () => {
    expect(contrastRatio(T['dark-accent']!, T['dark-bg']!)).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe('상품 이미지 플레이스홀더 톤', () => {
  it('그 위에 얹는 본문 색(n-900)이 읽힌다', () => {
    for (const tone of ['ph-sand', 'ph-stone', 'ph-clay', 'ph-olive', 'ph-mist']) {
      expect(
        contrastRatio(T['n-900']!, T[tone]!),
        `${tone} 위의 본문 대비가 부족합니다`,
      ).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });
});

describe('뉴트럴 램프', () => {
  it('단계가 어두워지는 순서를 유지한다', () => {
    const ramp = ['n-0','n-50','n-100','n-200','n-300','n-400','n-500','n-600','n-700','n-800','n-900','n-950'];
    const lum = ramp.map((k) => contrastRatio(T[k]!, '#FFFFFF'));
    for (let i = 1; i < lum.length; i += 1) {
      expect(lum[i]!, `${ramp[i]} 가 ${ramp[i - 1]} 보다 밝습니다`).toBeGreaterThan(lum[i - 1]!);
    }
  });
});

/**
 * 톤 블록 위의 글자.
 *
 * **여기가 비어 있었다.** 위의 검사는 글자색을 n-0·n-50 같은 밝은 표면에
 * 대고만 쟀는데, 사진 자리에 깔리는 톤 블록은 그보다 어둡다(0.86~0.91).
 * 그래서 n-500 으로 적어 둔 "IMAGE" 자리표시가 다섯 톤 전부에서 AA 에
 * 못 미치는 채로 지나갔다 — 실제 화면을 axe 로 훑고 나서야 드러났다.
 *
 * 토큰끼리 재는 검사가 짝을 빠뜨리면 그 짝은 아무도 안 본다.
 */
describe('톤 블록 위의 글자', () => {
  const TONES = ['ph-sand', 'ph-stone', 'ph-clay', 'ph-olive', 'ph-mist'] as const;

  it.each(TONES)('%s 위의 보조 글자(n-700)가 본문 기준을 넘는다', (tone) => {
    expect(contrastRatio(T['n-700']!, T[tone]!)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  /*
   * 한 단계 밝은 것으로 되돌리면 걸리게 해 둔다. n-500 은 3.29~3.87 이고
   * n-600 도 가장 어두운 톤(clay)에서 4.25 로 모자란다.
   */
  it('n-600 이하로는 못 내려간다 — 가장 어두운 톤에서 모자란다', () => {
    const worst = Math.min(...TONES.map((t) => contrastRatio(T['n-600']!, T[t]!)));
    expect(worst).toBeLessThan(AA_TEXT);
  });
});
