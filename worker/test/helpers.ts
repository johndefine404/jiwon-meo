import fixture from "../fixtures/programs.sample.json";
import { loadFixture, type BizinfoItem } from "../src/lib/bizinfo";
import type { Mail } from "../src/lib/mail";
import type { Profile } from "../src/lib/match";
import { makeD1 } from "./d1";

export const TODAY = "2026-10-12"; // 예시 데이터 기준일 (월요일)
export const SECRET = "test-secret-test-secret-test-secret-0123";

export const programs = () => loadFixture(fixture as { anchor: string; items: BizinfoItem[] });

export function profile(over: Partial<Profile> = {}): Profile {
  return {
    label: "내 사업장",
    sido: "경기",
    sigungu: "수원시",
    industry: "음식점·카페",
    bizType: "소상공인",
    years: "1~3년",
    interests: [],
    ...over,
  };
}

export function makeEnv() {
  const sink: Mail[] = [];
  const env: any = {
    DB: makeD1(),
    TOKEN_SECRET: SECRET,
    PUBLIC_URL: "https://jiwon.example.com",
    MAIL_FROM: "지원냥 <test@example.com>",
    SENDER_INFO: "Define404 (john@define404.com)",
    CONTACT_URL: "https://contact.define404.com",
    AI_MODEL: "@cf/meta/llama-3.1-8b-instruct",
    MOCK: "1",
    MAIL_SINK: sink,
  };
  return { env, sink };
}

// 메일 본문에서 #t= 토큰을 꺼낸다
export function tokenFrom(text: string, page: string): string {
  const m = text.match(new RegExp(`/${page}#t=([A-Za-z0-9_.-]+)`));
  if (!m) throw new Error(`no ${page} link in mail`);
  return m[1];
}
