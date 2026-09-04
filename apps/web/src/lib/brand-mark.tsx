/**
 * 워드마크의 P 를 도형으로 쌓은 것.
 *
 * **글꼴에 기대지 않는다.** 아이콘을 그리는 쪽에 Hahmlet 이 있을 리 없고,
 * 없으면 시스템 글꼴로 대체돼 브랜드와 다른 모양이 나온다. icon.svg 가
 * 같은 비율의 패스를 쓰므로 두 아이콘이 같은 모양이 된다.
 *
 * next/og(satori)는 임의의 SVG 패스를 그리지 못해서, 여기서는 사각형과
 * 반원으로 같은 형태를 만든다.
 */
export function BrandMark({ size, padding }: { size: number; padding: number }) {
  // icon.svg 의 P 는 폭 11.4 · 높이 18 (viewBox 32) 이다. 그 비율을 지킨다.
  const box = size - padding * 2;
  const height = box;
  const width = (11.4 / 18) * height;
  const stem = (3.6 / 11.4) * width;
  const bowl = (10.4 / 18) * height;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#181613',
      }}
    >
      <div style={{ display: 'flex', position: 'relative', width, height }}>
        {/* 세로 획 */}
        <div
          style={{
            position: 'absolute', left: 0, top: 0,
            width: stem, height, background: '#fefdfc',
          }}
        />
        {/* 볼 — 오른쪽만 둥근 반원 */}
        <div
          style={{
            position: 'absolute', left: stem, top: 0,
            width: width - stem, height: bowl, background: '#fefdfc',
            borderTopRightRadius: bowl / 2, borderBottomRightRadius: bowl / 2,
          }}
        />
      </div>
    </div>
  );
}
