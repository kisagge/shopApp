import { test, expect } from '@playwright/test';
import { budgetTests } from './bundle';

/**
 * 운영 화면의 상한.
 *
 * 운영진은 보통 좋은 회선을 쓰지만, 여기가 계약을 값으로 가져가는 코드가
 * 가장 많이 생기는 자리다 — 상태 목록·권한 목록 같은 것이 전부 계약 옆에
 * 있어 보인다. 실제로 가맹점 상태 폼이 그렇게 가져가고 있었다.
 *
 * 파일 이름의 `admin.spec.ts` 로 admin 프로젝트에 잡힌다(playwright.config).
 * 그 짝이 맞는지는 e2e-coverage 검사가 지킨다.
 */
/*
 * **편집기가 든 화면도 잰다.** 공지 편집기는 TipTap 과 ProseMirror 를 쓰는데,
 * 같은 묶음에 들어가면 공지를 고치러 오지 않은 사람도 그 무게를 치른다.
 * 열어 볼 때 받아 오게(`next/dynamic`) 해 두었는데, **그렇게 해 뒀다는 말과
 * 실제로 그런지는 다른 이야기다.**
 */
budgetTests(test, expect, ['/admin', '/admin/merchants', '/admin/orders', '/admin/support']);
