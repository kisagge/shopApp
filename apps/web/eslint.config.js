import { reactConfig } from '@shop/config/eslint/react';

export default [
  ...reactConfig,
  {
    /*
     * public 은 그대로 서빙되는 정적 파일이라 타입 프로젝트에 들어 있지
     * 않다. 서비스워커는 브라우저가 직접 받아 실행하므로 번들을 거치지
     * 않고, 그래서 여기 있어야 한다.
     */
    ignores: ['public/**'],
  },
];
