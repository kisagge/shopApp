/**
 * 로컬 시드 계정.
 *
 * 시드 스크립트와 E2E 테스트가 **같은 곳을 본다.** 양쪽에 따로 적어 두면
 * 비밀번호를 바꿨을 때 테스트가 이유 없이 깨지고, 왜 깨졌는지 찾는 데
 * 시간이 든다.
 *
 * 이 파일에는 부작용이 없다 — seed-users.ts 는 임포트만 해도 시드가 돌아서
 * 테스트에서 가져올 수 없다.
 *
 * **비밀이 아니다.** 개발용 데이터베이스를 채우기 위한 고정값이고,
 * 운영 계정과는 아무 관계가 없다.
 */
export const SEED_PASSWORD = 'plain1234!';

export const SEED_ACCOUNT = {
  customer: 'demo@plain.test',
  admin: 'admin@plain.test',
  superAdmin: 'super@plain.test',
  merchant: 'contact@studionoon.test',
} as const;
