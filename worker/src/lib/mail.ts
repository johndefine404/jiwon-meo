// 메일 발송. 고르는 순서:
//   Gmail API (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN 셋 다 있을 때)
//   > Resend (RESEND_API_KEY)
//   > 콘솔에 찍기만 (키가 없거나 MOCK=1)
// Gmail 은 gmail.send 권한만 있는 갱신 토큰으로 접근 토큰을 받아, 직접 만든 RFC 5322 메시지를 보낸다.
import type { Env } from "../env";

export type Mail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
};

export type MailProvider = "gmail" | "resend" | "log";

type MailEnv = Pick<Env, "MAIL_FROM" | "GMAIL_CLIENT_ID" | "GMAIL_CLIENT_SECRET" | "GMAIL_REFRESH_TOKEN" | "RESEND_API_KEY" | "MOCK" | "REPLY_TO">;

export function mailProvider(env: MailEnv): MailProvider {
  if (env.MOCK === "1") return "log";
  if (env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_REFRESH_TOKEN) return "gmail";
  if (env.RESEND_API_KEY) return "resend";
  return "log";
}

// ---------- MIME ----------

function utf8Base64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function base64url(s: string): string {
  return utf8Base64(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// 머리글 값에 ASCII 밖 글자가 있으면 =?UTF-8?B?...?= 로 바꾼다. 한 덩어리가 75자를 넘지 않게 나눈다
export function encodeWord(s: string): string {
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  const enc = new TextEncoder();
  const words: string[] = [];
  let cur = "";
  for (const ch of s) {
    // 원문 45바이트 = base64 60자, 앞뒤 표시를 붙여도 72자
    if (enc.encode(cur + ch).length > 45) {
      words.push(cur);
      cur = "";
    }
    cur += ch;
  }
  if (cur) words.push(cur);
  return words.map((w) => `=?UTF-8?B?${utf8Base64(w)}?=`).join("\r\n ");
}

// "이름 <주소>" 또는 "주소" 를 받아 이름 부분만 인코딩한다
export function encodeAddress(addr: string): string {
  const m = addr.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (!m) return addr.trim();
  const name = m[1].trim();
  if (!name) return `<${m[2].trim()}>`;
  const encoded = encodeWord(name);
  if (encoded === name && /[(),.:;<>@[\]\\"]/.test(name)) return `"${name.replace(/["\\]/g, "\\$&")}" <${m[2].trim()}>`;
  return `${encoded} <${m[2].trim()}>`;
}

function addrOnly(addr: string): string {
  const m = addr.match(/<([^>]+)>/);
  return (m ? m[1] : addr).trim();
}

function wrap76(b64: string): string {
  return b64.replace(/.{1,76}/g, "$&\r\n").replace(/\r\n$/, "");
}

function randomId(): string {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function buildMime(from: string, mail: Mail, opts: { replyTo?: string; now?: Date } = {}): string {
  const fromAddr = addrOnly(from);
  const domain = fromAddr.split("@")[1] || "localhost";
  const boundary = `=_jiwon_${randomId()}`;
  const now = opts.now ?? new Date();
  const head: string[] = [
    `From: ${encodeAddress(from)}`,
    `To: ${encodeAddress(mail.to)}`,
    `Subject: ${encodeWord(mail.subject)}`,
    `Date: ${now.toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${randomId()}@${domain}>`,
    "MIME-Version: 1.0",
  ];
  if (opts.replyTo) head.push(`Reply-To: ${encodeAddress(opts.replyTo)}`);
  // List-Unsubscribe, List-Unsubscribe-Post 같은 머리글은 그대로 붙인다 (줄바꿈이 든 값은 버린다)
  for (const [k, v] of Object.entries(mail.headers ?? {})) {
    if (/^[A-Za-z0-9-]+$/.test(k) && !/[\r\n]/.test(v)) head.push(`${k}: ${v}`);
  }
  head.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
  const part = (type: string, body: string) =>
    [`--${boundary}`, `Content-Type: ${type}; charset=UTF-8`, "Content-Transfer-Encoding: base64", "", wrap76(utf8Base64(body))].join("\r\n");
  return [head.join("\r\n"), "", part("text/plain", mail.text), part("text/html", mail.html), `--${boundary}--`, ""].join("\r\n");
}

// ---------- 보내기 ----------

// 접근 토큰은 만료 1분 전까지 메모리에 둔다 (같은 워커 인스턴스 안에서만)
let cachedToken: { value: string; exp: number; key: string } | null = null;

async function gmailAccessToken(env: MailEnv): Promise<string> {
  const key = `${env.GMAIL_CLIENT_ID}:${env.GMAIL_REFRESH_TOKEN?.slice(-8)}`;
  if (cachedToken && cachedToken.key === key && cachedToken.exp > Date.now() + 60_000) return cachedToken.value;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: env.GMAIL_CLIENT_ID!,
      client_secret: env.GMAIL_CLIENT_SECRET!,
      refresh_token: env.GMAIL_REFRESH_TOKEN!,
    }),
  });
  if (!res.ok) throw new Error(`gmail token ${res.status}`);
  const j = (await res.json()) as { access_token: string; expires_in?: number };
  cachedToken = { value: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000, key };
  return j.access_token;
}

export async function sendMail(env: Env, mail: Mail): Promise<MailProvider> {
  if (env.MAIL_SINK) {
    env.MAIL_SINK.push(mail);
    return "log";
  }
  const provider = mailProvider(env);
  if (provider === "gmail") {
    const token = await gmailAccessToken(env);
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: base64url(buildMime(env.MAIL_FROM, mail, { replyTo: env.REPLY_TO || undefined })) }),
    });
    if (!res.ok) throw new Error(`gmail send ${res.status}`);
    return provider;
  }
  if (provider === "resend") {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [mail.to],
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        ...(env.REPLY_TO ? { reply_to: env.REPLY_TO } : {}),
        headers: mail.headers,
      }),
    });
    if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text()}`);
    return provider;
  }
  console.log(`[mail:mock] to=${mail.to} subject=${mail.subject}\n${mail.text}\n[mail:mock:end]`);
  return provider;
}
