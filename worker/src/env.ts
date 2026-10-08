import type { Mail } from "./lib/mail";

export interface Env {
  DB: D1Database;
  AI?: Ai;
  LIMITER?: RateLimit;

  // 메일 링크 서명 비밀값 (32자 이상). npx wrangler secret put TOKEN_SECRET
  TOKEN_SECRET: string;
  // 메일 안 링크의 기준 주소. 예: https://jiwon.define404.com
  PUBLIC_URL: string;

  // 기업마당 지원사업정보 API 인증키. 없으면 운영에서는 주간 발송을 건너뛰고(MOCK=1 일 때만 예시 데이터)
  BIZINFO_API_KEY?: string;

  // 발송 1순위: Gmail API (gmail.send 권한만 있는 OAuth 갱신 토큰). 셋 다 있어야 쓴다
  GMAIL_CLIENT_ID?: string;
  GMAIL_CLIENT_SECRET?: string;
  GMAIL_REFRESH_TOKEN?: string;
  // 발송 2순위: Resend. 둘 다 없으면 콘솔에 찍기만 한다
  RESEND_API_KEY?: string;
  // 보내는 사람. 예: 지원냥 <john@define404.com>
  MAIL_FROM: string;
  // 답장 받을 주소 (없으면 넣지 않는다)
  REPLY_TO?: string;
  // 개인정보 처리방침 주소 (화면의 동의 칸과 아래쪽 링크)
  PRIVACY_URL?: string;
  // 메일 끝에 적는 보내는 곳 정보 (광고성 정보 전송자 명칭·연락처)
  SENDER_INFO: string;
  // "신청서 작성 도움 문의" 버튼 주소. 광고성 메일의 보내는 곳 연락처로도 적는다
  CONTACT_URL: string;

  // 공고 한 줄 요약에 Workers AI 를 쓸지 ("1" 이면 사용)
  USE_AI_SUMMARY?: string;
  AI_MODEL: string;

  // "1" 이면 외부 호출 없이 예시 데이터·콘솔 메일로만 동작 (로컬 시험)
  MOCK?: string;

  // 시험용: 보낸 메일을 여기에 쌓는다 (운영에서는 쓰지 않음)
  MAIL_SINK?: Mail[];
}
