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
  {
    files: ['src/**/*.tsx'],
    rules: {
      /*
       * **가로로 미는 표 상자에 탭 정거장을 준다.**
       *
       * 표가 화면보다 넓으면 상자 안에서 옆으로 밀리는데, 그 상자에
       * `tabindex` 가 없으면 **키보드로는 밀 수가 없다** — 접근성 검사(axe)가
       * `scrollable-region-focusable` 로 잡는 자리다. Chrome·Firefox 는 요즘
       * 알아서 초점을 주지만 Safari 는 안 주고, 검증할 수 없는 접근성은
       * 접근성이 아니다.
       *
       * 이 규칙은 기본으로 `tabpanel` 에만 허용한다. `region` 을 더한다 —
       * 다만 **이름 없는 정거장은 만들지 않는다**: 이 저장소의 표 상자는
       * 전부 `aria-label` 로 무엇을 담은 표인지 말한다(`.table-scroll`).
       */
      'jsx-a11y/no-noninteractive-tabindex': [
        'error',
        { tags: [], roles: ['tabpanel', 'region'], allowExpressionValues: true },
      ],
    },
  },
];
