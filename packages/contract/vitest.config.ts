import { defineConfig } from 'vitest/config';

/**
 * 이 꾸러미는 설정 없이 기본값으로 돌고 있었다. **커버리지를 묻기 위해** 만든다.
 *
 * 비율은 문지기가 아니다 — 묻는 것 하나뿐이다: **어느 창구 규칙이 한 번도 안 돌았는가.**
 * core 와 auth 에 같은 렌즈를 비췄더니 둘 다 실제 결함이 나왔다(올리기 파일에서 조용히
 * 사라지던 줄, 훅이 판정을 부르는지 아무도 안 보던 자리).
 *
 * 상한은 `package.json` 의 검사 명령이 깃발로 준다 — 여기 옮기면 두 곳이 갈린다.
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      include: ['src/**/*.ts'],
      // 모아 내보내기만 하는 파일이다 — 무엇이 안 돌았는지 묻는 데 보탬이 없다
      exclude: ['src/index.ts'],
    },
  },
});
