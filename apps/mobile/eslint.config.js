import { baseConfig } from '@shop/config/eslint/base';

export default [
  {
    /**
     * 네이티브 프로젝트는 `cap add` 가 만들어 낸 것이다 — 우리가 쓰지 않았고
     * 고칠 수도 없다(다음 sync 에 덮인다). 그 안의 Cordova 셈 js 까지 읽으려
     * 들면 tsconfig 에 없다며 파싱에서 멈춘다.
     */
    ignores: ['ios/**', 'android/**', 'www/**'],
  },
  ...baseConfig,
];
