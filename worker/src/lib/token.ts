// 메일 링크용 서명 토큰 (HMAC-SHA256).
// 모양: base64url(JSON{p,a,v,e}) + "." + base64url(서명)
//   p = 용도 (confirm | manage | unsub | adoff)  a = 계정 ID  v = 계정의 토큰 세대  e = 만료(초)
// 서명이 맞아도 용도가 다르거나, 만료됐거나, 세대가 바뀌었으면 거절한다.
export type Purpose = "confirm" | "manage" | "unsub" | "adoff";

export type TokenPayload = { p: Purpose; a: string; v: number; e: number };

export const TTL: Record<Purpose, number> = {
  confirm: 2 * 24 * 3600, // 확인 메일: 48시간
  manage: 30 * 24 * 3600, // 조건 변경: 30일 (매주 메일마다 새로 만든다)
  unsub: 400 * 24 * 3600, // 수신 거부: 오래된 메일에서도 동작해야 한다
  adoff: 400 * 24 * 3600, // 광고 수신만 거부: 수신 거부와 같은 이유로 길게
};

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function key(secret: string): Promise<CryptoKey> {
  if (!secret || secret.length < 32) throw new Error("TOKEN_SECRET must be at least 32 characters");
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signToken(
  secret: string,
  purpose: Purpose,
  accountId: string,
  version: number,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<string> {
  const payload: TokenPayload = { p: purpose, a: accountId, v: version, e: nowSec + TTL[purpose] };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await key(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

// 서명과 용도, 만료만 본다. 세대(v)는 DB 값과 호출한 쪽에서 비교한다.
export async function verifyToken(
  secret: string,
  token: string,
  purpose: Purpose,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<TokenPayload | null> {
  if (typeof token !== "string" || token.length > 600) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  let ok = false;
  try {
    // crypto.subtle.verify 는 서명 비교를 일정한 시간에 한다
    ok = await crypto.subtle.verify("HMAC", await key(secret), fromB64url(sig), enc.encode(body));
  } catch {
    return null;
  }
  if (!ok) return null;
  let payload: TokenPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromB64url(body)));
  } catch {
    return null;
  }
  if (payload.p !== purpose) return null;
  if (typeof payload.a !== "string" || typeof payload.v !== "number" || typeof payload.e !== "number") return null;
  if (payload.e < nowSec) return null;
  return payload;
}
