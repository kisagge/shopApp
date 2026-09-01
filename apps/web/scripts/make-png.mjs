import { deflateSync } from 'node:zlib';

/**
 * 최소 PNG 인코더.
 *
 * 상품 사진 자리에 넣을 플레이스홀더를 만든다. 외부 이미지를 받아 오지 않는
 * 이유는, 남의 사진을 저장소에 넣어 두면 나중에 출처를 설명할 수 없기
 * 때문이다. 여기서 만든 것은 명백히 플레이스홀더라 오해할 여지도 없다.
 */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/**
 * @param {number} width
 * @param {number} height
 * @param {(x: number, y: number) => [number, number, number]} paint
 */
export function encodePng(width, height, paint) {
  // 각 스캔라인 앞에 필터 바이트(0 = None)가 붙는다. 이걸 빼먹으면
  // 디코더가 첫 픽셀을 필터 종류로 읽고 이미지가 통째로 밀린다.
  const raw = Buffer.alloc(height * (1 + width * 3));
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0;
    offset += 1;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint(x, y);
      raw[offset] = r;
      raw[offset + 1] = g;
      raw[offset + 2] = b;
      offset += 3;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type 2 = truecolor
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** PLAIN 의 플레이스홀더 톤 (theme.css 의 --color-ph-*) */
export const TONES = {
  sand:  [0xe8, 0xdf, 0xd2],
  stone: [0xdc, 0xdd, 0xe1],
  clay:  [0xe7, 0xd5, 0xca],
  olive: [0xdb, 0xe0, 0xcd],
  mist:  [0xdc, 0xe4, 0xe4],
};

/**
 * 상품 자리 표시용 이미지.
 *
 * 아래쪽으로 갈수록 아주 살짝 어두워지고, 가운데에 옅은 사각형이 하나 있다.
 * 단색이면 이미지가 안 불러와진 것처럼 보이고, 무늬가 강하면 사진으로 착각한다.
 */
export function placeholder({ width = 800, height = 1000, tone = 'sand', variant = 0 }) {
  const base = TONES[tone] ?? TONES.sand;
  const boxTop = Math.round(height * (0.30 + variant * 0.04));
  const boxBottom = Math.round(height * (0.70 + variant * 0.04));
  const boxLeft = Math.round(width * 0.24);
  const boxRight = Math.round(width * 0.76);

  return encodePng(width, height, (x, y) => {
    const fade = 1 - (y / height) * 0.07;
    const inBox = x >= boxLeft && x < boxRight && y >= boxTop && y < boxBottom;
    const shade = inBox ? 0.945 : 1;
    return [
      Math.round(base[0] * fade * shade),
      Math.round(base[1] * fade * shade),
      Math.round(base[2] * fade * shade),
    ];
  });
}
