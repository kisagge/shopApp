import js from '@eslint/js';
import globals from 'globals';

/**
 * 설정 패키지 자신의 검사.
 *
 * 여기는 타입 검사를 쓰지 않는다. 이 패키지에는 tsconfig 가 없고 내용도
 * 순수 JS 설정 파일뿐이라, 타입 정보가 필요한 규칙을 켜면 파싱조차 못 한다.
 * 오타와 쓰지 않는 변수만 잡으면 충분하다.
 */
export default [
  { ignores: ['node_modules/**'] },
  js.configs.recommended,
  { languageOptions: { globals: { ...globals.node } } },
];
