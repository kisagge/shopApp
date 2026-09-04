import { ImageResponse } from 'next/og';

/**
 * 링크를 붙였을 때 뜨는 그림.
 *
 * 상품 페이지는 상품 사진을 쓰고(generateMetadata), 그 밖의 화면은 이
 * 기본 그림을 쓴다. 없으면 카카오톡·슬랙에 주소만 덩그러니 남는다.
 *
 * **워드마크는 기본 글꼴로 그린다.** 브랜드 글꼴(Hahmlet)을 쓰려면 빌드가
 * 글꼴 파일을 받아 와야 하는데, 빌드에 네트워크 의존을 새로 만드는 것은
 * 방금 이미지 호스트에서 겪은 것과 같은 종류의 위험이다. 자간을 넓게 줘
 * 브랜드의 인상만 맞춘다.
 */
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'PLAIN — 오래 두고 입을 것만 골라 담은 편집숍';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 28,
          background: '#181613',
        }}
      >
        <div
          style={{
            fontSize: 104,
            letterSpacing: 24,
            color: '#fefdfc',
            // 자간이 오른쪽에만 붙어 가운데가 밀려 보이는 것을 되돌린다
            paddingLeft: 24,
          }}
        >
          PLAIN
        </div>
        <div style={{ width: 96, height: 1, background: '#57534e' }} />
      </div>
    ),
    size,
  );
}
