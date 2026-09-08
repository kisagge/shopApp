/**
 * 시작 화면 그림을 만든다.
 *
 * **Capacitor 가 깔아 둔 기본 그림을 그대로 두면 남의 로고가 뜬다.** 앱을
 * 켜고 처음 보는 화면이 그것이면 그 뒤가 무엇이든 인상이 정해진다.
 *
 * 크기 목록을 손으로 적지 않는다 — 지금 프로젝트에 있는 splash.png 를
 * 찾아 그 크기 그대로 다시 그린다. 안드로이드의 밀도·방향 폴더가 늘거나
 * 줄어도 이 파일은 고치지 않는다.
 *
 * 밝은 화면 하나만 만든다. 웹앱의 manifest 도 밝은 배경 하나로 나가고
 * (background_color #FEFDFC), 시작 화면만 어둡게 두면 이어지는 화면과
 * 이음매가 보인다.
 *
 *   node apps/mobile/scripts/make-splash.mjs
 */
import { readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const HERE = dirname(fileURLToPath(import.meta.url));
const MOBILE = join(HERE, '..');

/** 웹앱의 토큰과 같은 값이다 — packages/ui 의 --color-n-0 · --color-n-900 */
const BG = '#fefdfc';
const INK = '#181613';

/**
 * 워드마크는 세리프에 자간을 넓게 준다 — 사이트 머리의 PLAIN 과 같은 결이다.
 * 글자 크기는 짧은 변에 맞춘다. 가로로 누운 화면에서도 넘치지 않는다.
 */
function svg(width, height) {
  const short = Math.min(width, height);
  const size = Math.round(short * 0.11);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<rect width="${width}" height="${height}" fill="${BG}"/>` +
      `<text x="${width / 2}" y="${height / 2}" fill="${INK}"` +
      ` font-family="Georgia, 'Times New Roman', serif" font-size="${size}"` +
      ` letter-spacing="${Math.round(size * 0.22)}"` +
      ` text-anchor="middle" dominant-baseline="central">PLAIN</text>` +
      `</svg>`,
  );
}

/** 폴더를 훑어 splash.png 를 전부 찾는다 */
function findSplashes(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) findSplashes(path, out);
    else if (name.startsWith('splash') && name.endsWith('.png')) out.push(path);
  }
  return out;
}

const targets = [
  ...findSplashes(join(MOBILE, 'android', 'app', 'src', 'main', 'res')),
  ...findSplashes(join(MOBILE, 'ios', 'App', 'App', 'Assets.xcassets', 'Splash.imageset')),
];

if (targets.length === 0) {
  console.error('splash.png 를 하나도 못 찾았다. 네이티브 프로젝트가 없는 것인지 본다.');
  process.exit(1);
}

for (const path of targets) {
  // 있는 그림의 크기를 그대로 따른다 — 목록을 손으로 적지 않기 위해서다
  const { width, height } = await sharp(readFileSync(path)).metadata();
  const png = await sharp(svg(width, height)).png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(path, png);
  console.log(`  ${width}x${height}  ${path.slice(MOBILE.length + 1)}`);
}

console.log(`\n시작 화면 ${targets.length}장을 다시 그렸습니다.`);
