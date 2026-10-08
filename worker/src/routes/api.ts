// 구독·확인·조건 변경·수신 거부 API
import { Hono } from "hono";
import { BIZ_TYPES, INDUSTRY_NAMES, INTEREST_NAMES, REGIONS, YEAR_NAMES } from "../data/options";
import type { Env } from "../env";
import { sendMail } from "../lib/mail";
import { confirmMail, link, manageMail, marketingResultMail } from "../lib/notices";
import {
  activate,
  claimMailSlot,
  createAccount,
  getAccountByEmail,
  getAccountById,
  getProfiles,
  marketingValid,
  MAX_CLIENTS,
  nowIso,
  normalizeEmail,
  parseProfiles,
  replaceProfiles,
  resetPending,
  setMarketing,
  unsubscribe,
  type Account,
} from "../lib/store";
import { verifyToken, type Purpose } from "../lib/token";
import { dataReady } from "../cron";

export const DEFAULT_PRIVACY_URL = "https://contact.define404.com/privacy.html";

const api = new Hono<{ Bindings: Env }>();

// 같은 주소로 신청해도 있는 계정인지 드러내지 않도록 늘 같은 답을 준다
const SENT = { ok: true, message: "확인 메일을 보냈습니다. 메일함(스팸함 포함)을 확인해 주세요." };

api.get("/meta", (c) =>
  c.json({
    regions: REGIONS,
    industries: INDUSTRY_NAMES,
    interests: INTEREST_NAMES,
    bizTypes: BIZ_TYPES,
    years: YEAR_NAMES,
    maxClients: MAX_CLIENTS,
    privacyUrl: c.env.PRIVACY_URL || DEFAULT_PRIVACY_URL,
    // false 면 첫 화면에 "첫 주간 메일은 공고 데이터 연결 뒤부터" 안내를 띄운다
    dataReady: dataReady(c.env),
  }),
);

async function readJson(c: any): Promise<any> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

api.post("/subscribe", async (c) => {
  const body = await readJson(c);
  if (!body) return c.json({ ok: false, error: "잘못된 요청입니다" }, 400);
  // 사람 눈에 보이지 않는 칸. 채워져 있으면 자동 입력으로 보고 조용히 끝낸다
  if (body.website) return c.json(SENT);
  const email = normalizeEmail(body.email);
  if (!email) return c.json({ ok: false, error: "메일 주소를 확인해 주세요" }, 400);
  const kind = body.kind === "consultant" ? "consultant" : "owner";
  if (body.privacy !== true) return c.json({ ok: false, error: "개인정보 수집·이용에 동의해 주셔야 구독할 수 있습니다" }, 400);
  const marketing = body.marketing === true;
  const profiles = parseProfiles(body.profiles, kind);
  if (typeof profiles === "string") return c.json({ ok: false, error: profiles }, 400);

  const db = c.env.DB;
  const existing = await getAccountByEmail(db, email);
  if (!existing) {
    const id = await createAccount(db, { email, kind, marketing, profiles });
    await claimMailSlot(db, id);
    await sendMail(c.env, await confirmMail(c.env, email, id, 1));
    return c.json(SENT);
  }
  if (existing.status === "pending") {
    await resetPending(db, existing.id, { kind, marketing, profiles });
    if (await claimMailSlot(db, existing.id)) {
      await sendMail(c.env, await confirmMail(c.env, email, existing.id, existing.token_version));
    }
    return c.json(SENT);
  }
  // 이미 구독 중: 조건을 바꾸지 않고, 조건 바꾸기 링크만 메일로 보낸다
  if (await claimMailSlot(db, existing.id)) {
    await sendMail(c.env, await manageMail(c.env, email, existing.id, existing.token_version));
  }
  return c.json(SENT);
});

// 토큰을 검증하고 그 토큰의 계정만 돌려준다. 세대가 다르면(수신 거부 등) 거절
async function accountFrom(c: any, token: unknown, purposes: Purpose[]): Promise<Account | null> {
  if (typeof token !== "string") return null;
  for (const p of purposes) {
    const payload = await verifyToken(c.env.TOKEN_SECRET, token, p);
    if (!payload) continue;
    const acc = await getAccountById(c.env.DB, payload.a);
    if (!acc || acc.token_version !== payload.v) return null;
    return acc;
  }
  return null;
}

function bearer(c: any): string | undefined {
  const h = c.req.header("Authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : undefined;
}

// 광고성 정보 수신 동의·철회 처리 결과를 메일로 알린다 (정보통신망법 제50조 제7항).
// 알림 발송이 실패해도 동의·철회 처리 자체는 되돌리지 않는다 (실패는 기록만)
async function notifyMarketing(c: any, acc: Account, email: string | null, change: "on" | "off" | "unsubscribed", at: string) {
  if (!email) return;
  try {
    await sendMail(c.env, await marketingResultMail(c.env, email, acc.id, acc.token_version, change, at));
  } catch (e) {
    console.error("marketing notice failed", acc.id, e);
  }
}

const INVALID = { ok: false, error: "링크가 만료되었거나 올바르지 않습니다. 첫 화면에서 링크를 다시 받아 주세요." };

api.post("/confirm", async (c) => {
  const body = await readJson(c);
  const acc = await accountFrom(c, body?.token, ["confirm"]);
  if (!acc || acc.status === "unsubscribed") return c.json(INVALID, 401);
  if (acc.status === "pending") {
    await activate(c.env.DB, acc.id);
    // 신청 때 광고 수신에 동의했다면 구독이 확정된 지금 동의 처리 결과를 알린다
    if (acc.marketing_consent) await notifyMarketing(c, acc, acc.email, "on", nowIso());
  }
  // 확인한 사람에게 바로 조건 바꾸기 링크를 준다
  const manage = await link(c.env, "manage", "manage", acc.id, acc.token_version);
  return c.json({ ok: true, manageUrl: manage });
});

api.post("/manage-link", async (c) => {
  const body = await readJson(c);
  const email = normalizeEmail(body?.email);
  if (!email) return c.json({ ok: false, error: "메일 주소를 확인해 주세요" }, 400);
  const acc = await getAccountByEmail(c.env.DB, email);
  if (acc && acc.status === "active" && (await claimMailSlot(c.env.DB, acc.id))) {
    await sendMail(c.env, await manageMail(c.env, email, acc.id, acc.token_version));
  }
  return c.json({ ok: true, message: "구독 중인 주소라면 조건 바꾸기 링크를 보냈습니다." });
});

api.get("/manage", async (c) => {
  const acc = await accountFrom(c, bearer(c), ["manage"]);
  if (!acc || acc.status !== "active") return c.json(INVALID, 401);
  const profiles = await getProfiles(c.env.DB, acc.id);
  return c.json({
    ok: true,
    email: acc.email,
    kind: acc.kind,
    marketing: marketingValid(acc),
    confirmedAt: acc.confirmed_at,
    profiles: profiles.map(({ id, ...p }) => p),
  });
});

api.put("/manage", async (c) => {
  const acc = await accountFrom(c, bearer(c), ["manage"]);
  if (!acc || acc.status !== "active") return c.json(INVALID, 401);
  const body = await readJson(c);
  if (!body) return c.json({ ok: false, error: "잘못된 요청입니다" }, 400);
  // 계정 종류(사장님/컨설턴트)는 바꾸지 않는다. 바꾸려면 수신 거부 후 다시 신청
  const profiles = parseProfiles(body.profiles, acc.kind);
  if (typeof profiles === "string") return c.json({ ok: false, error: profiles }, 400);
  await replaceProfiles(c.env.DB, acc.id, profiles);
  let notice = "";
  if (typeof body.marketing === "boolean" && body.marketing !== marketingValid(acc)) {
    await setMarketing(c.env.DB, acc.id, body.marketing);
    await notifyMarketing(c, acc, acc.email, body.marketing ? "on" : "off", nowIso());
    notice = ` 광고성 정보 수신 ${body.marketing ? "동의" : "철회"} 처리 결과를 메일로 보내 드렸습니다.`;
  }
  return c.json({ ok: true, message: `저장했습니다. 다음 주 메일부터 바뀐 조건으로 보내 드립니다.${notice}` });
});

const UNSUB_DONE = { ok: true, message: "수신 거부를 마쳤습니다. 메일 주소와 조건을 지웠고 더 이상 메일을 보내지 않습니다." };

// 서명·용도·만료가 맞는 수신 거부(또는 조건 바꾸기) 토큰이고, 그 계정이 이미 수신 거부 상태인가
async function alreadyUnsubscribed(c: any, token: unknown): Promise<boolean> {
  if (typeof token !== "string") return false;
  for (const p of ["unsub", "manage"] as Purpose[]) {
    const payload = await verifyToken(c.env.TOKEN_SECRET, token, p);
    if (!payload) continue;
    const acc = await getAccountById(c.env.DB, payload.a);
    return !!acc && acc.status === "unsubscribed";
  }
  return false;
}

// 수신 거부. 화면 버튼(JSON token), 조건 바꾸기 화면(Bearer), 메일 앱의 한 번 누르기(RFC 8058, ?t=) 모두 받는다
api.post("/unsubscribe", async (c) => {
  let token: string | undefined = c.req.query("t") || bearer(c);
  if (!token) {
    const body = await readJson(c);
    token = body?.token;
  }
  const acc = await accountFrom(c, token, ["unsub", "manage"]);
  if (!acc) {
    // 이미 거부한 계정의 서명이 맞는 링크를 다시 누른 경우 (메일 앱 한 번 누르기 뒤 화면 버튼 등): 같은 결과를 다시 알린다
    if (await alreadyUnsubscribed(c, token)) return c.json(UNSUB_DONE);
    return c.json(INVALID, 401);
  }
  if (acc.status !== "unsubscribed") {
    await unsubscribe(c.env.DB, acc.id);
    // 광고 수신 동의가 남아 있던 분께는 동의 철회 처리 결과를 한 번 알린다 (메일 주소는 이미 지웠고, 이 한 통에만 쓴다)
    if (acc.marketing_consent) await notifyMarketing(c, acc, acc.email, "unsubscribed", nowIso());
  }
  return c.json(UNSUB_DONE);
});

// 광고 수신만 거부 (지원사업 메일은 계속 받는다). 주간 메일의 "광고 수신만 거부" 화면 버튼(JSON token)과 조건 바꾸기 화면(Bearer)
api.post("/marketing-off", async (c) => {
  let token: string | undefined = bearer(c);
  if (!token) {
    const body = await readJson(c);
    token = body?.token;
  }
  const acc = await accountFrom(c, token, ["adoff", "manage"]);
  if (!acc || acc.status !== "active") return c.json(INVALID, 401);
  if (!acc.marketing_consent) return c.json({ ok: true, message: "이미 광고 수신에 동의하지 않은 상태입니다. 지원사업 메일은 그대로 받으십니다." });
  await setMarketing(c.env.DB, acc.id, false);
  await notifyMarketing(c, acc, acc.email, "off", nowIso());
  return c.json({ ok: true, message: "광고 수신 거부를 마쳤습니다. 지원사업 메일은 그대로 받으시고, 처리 결과를 메일로 보내 드렸습니다." });
});

export default api;
