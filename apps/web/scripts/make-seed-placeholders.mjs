/**
 * 시드가 쓸 자리표시 사진을 만들어 public/seed 에 둔다.
 *
 * **CI 에는 사진이 한 장도 없었다.** 시드가 상품·배너·기획전 어디에도
 * 이미지를 넣지 않아서, 사진에 관한 검사 둘이 매 실행마다 조용히 건너뛰고
 * 있었다("2 skipped"). 로컬에서만 seed:photos 로 채워 넣으니 사람이 직접
 * 돌려 봐야 알 수 있는 상태였다.
 *
 * 남의 사진을 저장소에 넣지 않는다 — 나중에 출처를 설명할 수 없다.
 * make-png 가 만드는 것은 명백히 자리표시라 오해할 여지도 없다.
 *
 *   node apps/web/scripts/make-seed-placeholders.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { placeholder } from './make-png.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'public', 'seed');

/**
 * 자리마다 비율이 다르다. 한 장을 늘여 쓰면 화면에서 잘리거나 여백이
 * 생겨서, 사진이 들어갈 자리의 크기를 확인하는 검사가 뜻을 잃는다.
 */
const FILES = [
  { name: 'collection.png', width: 1200, height: 800, tone: 'clay', variant: 0 },
  { name: 'banner.png', width: 1600, height: 900, tone: 'sand', variant: 1 },
  { name: 'product.png', width: 800, height: 1000, tone: 'stone', variant: 2 },
  // 한 상품의 두 번째 사진 — 상품 화면의 작은 사진 단추를 검사가 누를 수 있게. 첫 장과 달라 보여야 한다
  { name: 'product-detail.png', width: 800, height: 1000, tone: 'clay', variant: 3 },
];

mkdirSync(OUT, { recursive: true });
for (const file of FILES) {
  const png = placeholder(file);
  writeFileSync(join(OUT, file.name), png);
  console.log(`  ${file.width}x${file.height}  public/seed/${file.name}  ${(png.length / 1024).toFixed(1)}KB`);
}
console.log(`\n자리표시 ${FILES.length}장을 만들었습니다.`);
