import type { Mail } from "./lib/mail";

export interface Env {
  DB: D1Database;
  AI?: Ai;
  LIMITER?: RateLimit;

  // 메일 링크 서명 비밀값 (32자 이상). npx wrangler secret put TOKEN_SECRET
  TOKEN_SECRET: string;
  // 메일 안 링크의 기준 주소. 예: https://jiwon.define404.com
  PUBLIC_URL: string;

  // 기업마당 지원사업정보 API 인증키. 없으면 예시 데이터로 동작한다
  BIZINFO_API_KEY?: string;

  // 발송 (Resend). 키가 없으면 콘솔에 찍기만 한다
  RESEND_API_KEY?: string;
  MAIL_FROM: string;
  // 메일 끝에 적는 보내는 곳 정보 (광고성 정보 전송자 명칭·연락처)
  SENDER_INFO: string;
  // "신청서 작성 도움 문의" 버튼 주소
  CONTACT_URL: string;

  // 공고 한 줄 요약에 Workers AI 를 쓸지 ("1" 이면 사용)
  USE_AI_SUMMARY?: string;
  AI_MODEL: string;

  // 광고성 정보를 넣은 메일 제목 앞에 "(광고)"를 붙인다. "0" 이면 끈다 (법률 확인 필요)
  AD_LABEL?: string;

  // "1" 이면 외부 호출 없이 예시 데이터·콘솔 메일로만 동작 (로컬 시험)
  MOCK?: string;

  // 시험용: 보낸 메일을 여기에 쌓는다 (운영에서는 쓰지 않음)
  MAIL_SINK?: Mail[];
}
