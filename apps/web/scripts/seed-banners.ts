/** 홈 배너 시드. 코드에 박혀 있던 히어로 문구를 그대로 옮긴다. */
import { prisma } from '@shop/db';

const BANNERS = [
  {
    eyebrow: 'EDITORIAL · 01',
    headline: '겨울을 오래\n입는 방법',
    subcopy:
      '한 벌로 계절을 나는 아우터 12선. 소재와 무게, 그리고 오래 두고 입을 만한 실루엣을 기준으로 골랐습니다.',
    ctaLabel: '기획전 보기',
    href: '/category/outer',
    tone: 'sand',
    sortOrder: 0,
  },
  {
    eyebrow: 'EDITORIAL · 02',
    headline: '매일 입는 니트',
    subcopy: '보풀이 덜 생기는 조직과 실을 골랐습니다. 세탁 후에도 처음의 두께를 지킵니다.',
    ctaLabel: '니트 보기',
    href: '/category/knit',
    tone: 'olive',
    sortOrder: 1,
  },
];

const existing = await prisma.banner.count();
if (existing > 0) {
  console.log(`이미 배너 ${existing}개가 있어 건너뜁니다`);
} else {
  for (const banner of BANNERS) {
    const created = await prisma.banner.create({ data: banner });
    console.log(`${created.headline.replace(/\n/g, ' ')} — ${created.tone}`);
  }
  console.log(`\n${BANNERS.length}개 생성`);
}
await prisma.$disconnect();
