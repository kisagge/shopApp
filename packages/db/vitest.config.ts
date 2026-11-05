import { defineConfig } from 'vitest/config';

/**
 * 이 꾸러미도 설정 없이 돌고 있었다. **커버리지를 묻기 위해** 만든다.
 *
 * `src/generated` 는 프리즈마가 찍어 주는 **남의 코드**라 뺀다 — 우리가 고칠 수도 없고,
 * 수만 줄이 보고를 덮어 정작 물어야 할 자리가 안 보인다.
 *
 * 시드 스크립트(`seed-*.ts`·`backfill-*.ts`)는 **그대로 둔다.** 단위 검사가 안 밟는다는
 * 것이 사실이고(문지기의 DB 준비 단계가 주소로 밟는다), 우리 코드를 보고에서 빼면 다음에
 * 이 렌즈를 쓰는 사람이 그 자리를 아예 묻지 못한다.
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/generated/**'],
    },
  },
});
