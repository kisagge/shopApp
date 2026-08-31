// 'server-only' 는 클라이언트 번들에 서버 코드가 섞이는 걸 막는 가드다.
// 실제 방어는 next build 가 하고, vitest 에는 RSC 경계가 없으므로 빈 모듈로 대체한다.
export {};
