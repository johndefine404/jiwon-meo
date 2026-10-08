import { describe, expect, it } from "vitest";
import { base64url, buildMime, encodeAddress, encodeWord, mailProvider } from "../src/lib/mail";
import { runWeekly } from "../src/cron";
import { app } from "../src/index";
import { makeEnv } from "./helpers";

function decodeB64(b64: string): string {
  const bin = atob(b64.replace(/\s+/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

// =?UTF-8?B?...?= 덩어리들을 이어 붙여 원문으로 되돌린다
function decodeWords(v: string): string {
  return [...v.matchAll(/=\?UTF-8\?B\?([^?]+)\?=/g)].map((m) => decodeB64(m[1])).join("");
}

function header(mime: string, name: string): string {
  const head = mime.split("\r\n\r\n")[0].replace(/\r\n /g, " ");
  const line = head.split("\r\n").find((l) => l.toLowerCase().startsWith(name.toLowerCase() + ":"));
  return line ? line.slice(name.length + 1).trim() : "";
}

const MAIL = {
  to: "john@define404.com",
  subject: "(광고) [지원냥] 이번 주 맞는 지원사업 7건",
  text: "이번 주 공고입니다.\n수신 거부: https://jiwon.example.com/unsubscribe#t=x",
  html: "<p>이번 주 공고입니다.</p>",
  headers: {
    "List-Unsubscribe": "<https://jiwon.example.com/api/unsubscribe?t=x>",
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  },
};

describe("MIME 메시지", () => {
  const mime = buildMime("지원냥 <john@define404.com>", MAIL, { replyTo: "john@define404.com", now: new Date("2026-10-12T00:00:00Z") });

  it("한글 제목과 보내는 사람 이름을 UTF-8 인코딩 단어로 넣는다", () => {
    const subject = header(mime, "Subject");
    expect(subject).toMatch(/^=\?UTF-8\?B\?/);
    expect(decodeWords(subject)).toBe(MAIL.subject);
    const from = header(mime, "From");
    expect(from).toMatch(/<john@define404\.com>$/);
    expect(decodeWords(from)).toBe("지원냥");
    // 머리글 줄은 ASCII 만
    expect(/^[\x00-\x7f]*$/.test(mime.split("\r\n\r\n")[0])).toBe(true);
  });

  it("필수 머리글과 수신 거부 머리글을 넣는다", () => {
    expect(header(mime, "To")).toBe("john@define404.com");
    expect(header(mime, "Date")).toBe("Mon, 12 Oct 2026 00:00:00 +0000");
    expect(header(mime, "Message-ID")).toMatch(/^<[0-9a-f]{32}@define404\.com>$/);
    expect(header(mime, "MIME-Version")).toBe("1.0");
    expect(header(mime, "Reply-To")).toBe("john@define404.com");
    expect(header(mime, "List-Unsubscribe")).toBe(MAIL.headers["List-Unsubscribe"]);
    expect(header(mime, "List-Unsubscribe-Post")).toBe("List-Unsubscribe=One-Click");
  });

  it("text/plain 과 text/html 두 부분이 모두 있고 원문으로 풀린다", () => {
    const boundary = header(mime, "Content-Type").match(/boundary="([^"]+)"/)![1];
    expect(header(mime, "Content-Type")).toMatch(/^multipart\/alternative;/);
    const parts = mime.split(`--${boundary}`).slice(1, -1);
    expect(parts).toHaveLength(2);
    const [plain, html] = parts.map((p) => {
      const [h, body] = p.trim().split("\r\n\r\n");
      return { h, body: decodeB64(body) };
    });
    expect(plain.h).toContain("Content-Type: text/plain; charset=UTF-8");
    expect(plain.h).toContain("Content-Transfer-Encoding: base64");
    expect(plain.body).toBe(MAIL.text);
    expect(html.h).toContain("Content-Type: text/html; charset=UTF-8");
    expect(html.body).toBe(MAIL.html);
    expect(mime.trimEnd().endsWith(`--${boundary}--`)).toBe(true);
    // 본문 base64 줄은 76자 이하
    expect(mime.split("\r\n").every((l) => l.length <= 998)).toBe(true);
  });

  it("줄바꿈이 든 머리글 값은 버린다 (머리글 끼워 넣기 방지)", () => {
    const bad = buildMime("지원냥 <john@define404.com>", { ...MAIL, headers: { "X-Test": "a\r\nBcc: evil@example.com" } });
    expect(bad).not.toContain("Bcc:");
  });

  it("긴 한글 제목은 여러 인코딩 단어로 나누고 각 덩어리는 75자 이하", () => {
    const long = "가".repeat(80);
    const enc = encodeWord(long);
    const words = enc.split("\r\n ");
    expect(words.length).toBeGreaterThan(1);
    expect(words.every((w) => w.length <= 75)).toBe(true);
    expect(decodeWords(enc)).toBe(long);
  });

  it("ASCII 이름과 주소만 있는 경우", () => {
    expect(encodeAddress("john@define404.com")).toBe("john@define404.com");
    expect(encodeAddress("Define404 <john@define404.com>")).toBe("Define404 <john@define404.com>");
    expect(encodeWord("plain")).toBe("plain");
  });

  it("base64url 은 + / = 를 쓰지 않는다", () => {
    const s = base64url(mime);
    expect(s).not.toMatch(/[+/=]/);
  });
});

describe("발송 경로 고르기", () => {
  const base = { MAIL_FROM: "지원냥 <john@define404.com>" };
  it("Gmail 값 셋이 다 있으면 Gmail, 아니면 Resend, 둘 다 없으면 로그", () => {
    expect(mailProvider({ ...base, GMAIL_CLIENT_ID: "a", GMAIL_CLIENT_SECRET: "b", GMAIL_REFRESH_TOKEN: "c", RESEND_API_KEY: "r" })).toBe("gmail");
    expect(mailProvider({ ...base, GMAIL_CLIENT_ID: "a", GMAIL_CLIENT_SECRET: "b", RESEND_API_KEY: "r" })).toBe("resend");
    expect(mailProvider(base)).toBe("log");
    expect(mailProvider({ ...base, MOCK: "1", GMAIL_CLIENT_ID: "a", GMAIL_CLIENT_SECRET: "b", GMAIL_REFRESH_TOKEN: "c" })).toBe("log");
  });
});

describe("공고 데이터가 연결되지 않은 운영", () => {
  it("기업마당 키가 없으면 주간 발송을 건너뛰고 예시 공고를 보내지 않는다", async () => {
    const { env, sink } = makeEnv();
    env.MOCK = "0";
    const r = await runWeekly(env, Date.parse("2026-10-12T00:00:00Z"));
    expect(r).toMatchObject({ sent: 0, programs: 0 });
    expect(sink).toHaveLength(0);
  });

  it("/api/meta 가 처리방침 주소와 데이터 준비 여부를 알려 준다", async () => {
    const { env } = makeEnv();
    env.MOCK = "0";
    let res = await app.request("/api/meta", {}, env);
    let j: any = await res.json();
    expect(j.dataReady).toBe(false);
    expect(j.privacyUrl).toBe("https://contact.define404.com/privacy.html");
    env.PRIVACY_URL = "https://example.com/p";
    env.BIZINFO_API_KEY = "k";
    res = await app.request("/api/meta", {}, env);
    j = await res.json();
    expect(j.dataReady).toBe(true);
    expect(j.privacyUrl).toBe("https://example.com/p");
  });
});
