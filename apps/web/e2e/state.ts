/** 역할별 세션 파일. .gitignore 의 test-results/ 아래에 둔다. */
export const STATE_FILE = {
  customer: 'test-results/.auth/customer.json',
  admin: 'test-results/.auth/admin.json',
  merchant: 'test-results/.auth/merchant.json',
} as const;
