import { ImageResponse } from 'next/og';

/**
 * 홈 화면에 추가했을 때 쓰이는 아이콘.
 *
 * **애플은 SVG 를 받지 않는다.** 그래서 이 한 장만 래스터로 만든다.
 * next/og 가 빌드 때 그려 주므로 저장소에 PNG 를 커밋하지 않아도 된다 —
 * 색이나 모양을 고칠 때 그림 파일을 다시 만들 필요가 없다.
 */
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
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
        {/*
          icon.svg 와 같은 비율의 P 를 도형으로 쌓는다. 글꼴에 기대지 않아야
          두 아이콘이 같은 모양으로 나온다.
        */}
        <div style={{ display: 'flex', position: 'relative', width: 64, height: 101 }}>
          {/* 세로 획 */}
          <div
            style={{
              position: 'absolute', left: 0, top: 0,
              width: 20, height: 101, background: '#fefdfc',
            }}
          />
          {/* 볼 — 오른쪽만 둥근 반원 */}
          <div
            style={{
              position: 'absolute', left: 20, top: 0,
              width: 44, height: 58, background: '#fefdfc',
              borderTopRightRadius: 29, borderBottomRightRadius: 29,
            }}
          />
        </div>
      </div>
    ),
    size,
  );
}
