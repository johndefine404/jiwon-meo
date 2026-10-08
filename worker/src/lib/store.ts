// D1 읽고 쓰기 + 입력 검사. 계정 ID 는 항상 검증된 토큰에서만 받는다 (요청 본문의 ID 는 믿지 않는다).
import { BIZ_TYPES, INDUSTRY_NAMES, INTEREST_NAMES, REGIONS, YEAR_NAMES, type BizType } from "../data/options";
import type { Profile } from "./match";

export const MAX_CLIENTS = 30;
// 광고성 정보 수신 동의는 2년마다 확인해야 한다 (정보통신망법 제50조 제8항, 시행령 제62조의3).
// 이 프로젝트는 확인 안내 메일 대신, 동의 후 2년이 지나면 동의를 끝난 것으로 보고 광고를 빼는 쪽을 택했다
export const MARKETING_VALID_DAYS = 730;
export const PENDING_HOURS = 48; // 확인하지 않은 신청을 지우는 기준. 매일 정리하므로 신청 후 3일 안에 지워진다

export type Account = {
  id: string;
  email: string | null;
  kind: "owner" | "consultant";
  status: "pending" | "active" | "unsubscribed";
  token_version: number;
  privacy_consent_at: string | null;
  marketing_consent: number;
  marketing_consent_at: string | null;
  created_at: string;
  confirmed_at: string | null;
  unsubscribed_at: string | null;
  last_mail_at: string | null;
};

type ProfileRow = {
  id: number;
  account_id: string;
  label: string;
  sido: string;
  sigungu: string;
  industry: string;
  biz_type: string;
  years: string;
  interests: string;
};

export const nowIso = () => new Date().toISOString();

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const e = raw.trim().toLowerCase();
  if (e.length < 6 || e.length > 254) return null;
  if (!/^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i.test(e)) return null;
  return e;
}

// 화면에서 온 조건 하나를 검사한다. 틀리면 이유 문자열을 돌려준다
export function parseProfile(raw: any, kind: "owner" | "consultant"): Profile | string {
  if (!raw || typeof raw !== "object") return "조건이 비어 있습니다";
  const sido = String(raw.sido ?? "");
  if (!(sido in REGIONS)) return "시도를 골라 주세요";
  const sigungu = String(raw.sigungu ?? "");
  if (sigungu && !REGIONS[sido].includes(sigungu)) return "시군구가 시도와 맞지 않습니다";
  const industry = String(raw.industry ?? "");
  if (!INDUSTRY_NAMES.includes(industry)) return "업종을 골라 주세요";
  const bizType = String(raw.bizType ?? "") as BizType;
  if (!BIZ_TYPES.includes(bizType)) return "사업자 구분을 골라 주세요";
  const years = String(raw.years ?? "");
  if (!YEAR_NAMES.includes(years)) return "업력을 골라 주세요";
  const interests = Array.isArray(raw.interests) ? [...new Set(raw.interests.map(String))] : [];
  if (interests.some((i) => !INTEREST_NAMES.includes(i as string))) return "관심 분야 값이 올바르지 않습니다";
  let label = "내 사업장";
  if (kind === "consultant") {
    label = String(raw.label ?? "").trim().replace(/\s+/g, " ");
    if (!label) return "고객 별칭을 적어 주세요";
    if (label.length > 30) return "고객 별칭은 30자 이내로 적어 주세요";
  }
  return { label, sido, sigungu, industry, bizType, years, interests: interests as string[] };
}

export function parseProfiles(raw: unknown, kind: "owner" | "consultant"): Profile[] | string {
  if (!Array.isArray(raw) || raw.length === 0) return "조건을 하나 이상 넣어 주세요";
  if (kind === "owner" && raw.length !== 1) return "사장님 구독은 조건 하나만 넣을 수 있습니다";
  if (raw.length > MAX_CLIENTS) return `고객은 ${MAX_CLIENTS}곳까지 넣을 수 있습니다`;
  const out: Profile[] = [];
  for (const r of raw) {
    const p = parseProfile(r, kind);
    if (typeof p === "string") return p;
    out.push(p);
  }
  return out;
}

function rowToProfile(r: ProfileRow): Profile {
  return {
    id: r.id,
    label: r.label,
    sido: r.sido,
    sigungu: r.sigungu,
    industry: r.industry,
    bizType: r.biz_type as BizType,
    years: r.years,
    interests: r.interests ? r.interests.split(",").filter(Boolean) : [],
  };
}

export async function getAccountById(db: D1Database, id: string): Promise<Account | null> {
  return (await db.prepare("SELECT * FROM accounts WHERE id = ?").bind(id).first<Account>()) ?? null;
}

export async function getAccountByEmail(db: D1Database, email: string): Promise<Account | null> {
  return (await db.prepare("SELECT * FROM accounts WHERE email = ?").bind(email).first<Account>()) ?? null;
}

export async function getProfiles(db: D1Database, accountId: string): Promise<Profile[]> {
  const { results } = await db
    .prepare("SELECT * FROM profiles WHERE account_id = ? ORDER BY id")
    .bind(accountId)
    .all<ProfileRow>();
  return (results || []).map(rowToProfile);
}

function profileInserts(db: D1Database, accountId: string, profiles: Profile[], at: string): D1PreparedStatement[] {
  return profiles.map((p) =>
    db
      .prepare(
        "INSERT INTO profiles (account_id, label, sido, sigungu, industry, biz_type, years, interests, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
      )
      .bind(accountId, p.label, p.sido, p.sigungu, p.industry, p.bizType, p.years, p.interests.join(","), at),
  );
}

export async function replaceProfiles(db: D1Database, accountId: string, profiles: Profile[]): Promise<void> {
  const at = nowIso();
  await db.batch([db.prepare("DELETE FROM profiles WHERE account_id = ?").bind(accountId), ...profileInserts(db, accountId, profiles, at)]);
}

export async function createAccount(
  db: D1Database,
  a: { email: string; kind: "owner" | "consultant"; marketing: boolean; profiles: Profile[] },
): Promise<string> {
  const id = crypto.randomUUID();
  const at = nowIso();
  await db.batch([
    db
      .prepare(
        "INSERT INTO accounts (id, email, kind, status, privacy_consent_at, marketing_consent, marketing_consent_at, created_at) VALUES (?,?,?,'pending',?,?,?,?)",
      )
      .bind(id, a.email, a.kind, at, a.marketing ? 1 : 0, a.marketing ? at : null, at),
    ...profileInserts(db, id, a.profiles, at),
    consentEvent(db, id, "privacy", 1, at),
    consentEvent(db, id, "marketing", a.marketing ? 1 : 0, at),
  ]);
  return id;
}

// 확인 전(pending) 계정이 다시 신청하면 조건과 동의를 새 값으로 바꾼다
export async function resetPending(
  db: D1Database,
  id: string,
  a: { kind: "owner" | "consultant"; marketing: boolean; profiles: Profile[] },
): Promise<void> {
  const at = nowIso();
  await db.batch([
    db
      .prepare("UPDATE accounts SET kind = ?, privacy_consent_at = ?, marketing_consent = ?, marketing_consent_at = ? WHERE id = ? AND status = 'pending'")
      .bind(a.kind, at, a.marketing ? 1 : 0, a.marketing ? at : null, id),
    db.prepare("DELETE FROM profiles WHERE account_id = ?").bind(id),
    ...profileInserts(db, id, a.profiles, at),
    consentEvent(db, id, "privacy", 1, at),
    consentEvent(db, id, "marketing", a.marketing ? 1 : 0, at),
  ]);
}

export function consentEvent(db: D1Database, accountId: string, kind: string, value: number, at = nowIso()): D1PreparedStatement {
  return db.prepare("INSERT INTO consent_events (account_id, kind, value, at) VALUES (?,?,?,?)").bind(accountId, kind, value, at);
}

export async function activate(db: D1Database, id: string): Promise<void> {
  await db.prepare("UPDATE accounts SET status = 'active', confirmed_at = ? WHERE id = ? AND status = 'pending'").bind(nowIso(), id).run();
}

export async function setMarketing(db: D1Database, id: string, on: boolean): Promise<void> {
  const at = nowIso();
  await db.batch([
    db.prepare("UPDATE accounts SET marketing_consent = ?, marketing_consent_at = ? WHERE id = ?").bind(on ? 1 : 0, on ? at : null, id),
    consentEvent(db, id, "marketing", on ? 1 : 0, at),
  ]);
}

// 수신 거부: 메일 주소와 조건을 지우고 이전 링크를 모두 무효로 만든다
export async function unsubscribe(db: D1Database, id: string): Promise<void> {
  const at = nowIso();
  await db.batch([
    db.prepare("DELETE FROM profiles WHERE account_id = ?").bind(id),
    db
      .prepare(
        "UPDATE accounts SET email = NULL, status = 'unsubscribed', unsubscribed_at = ?, marketing_consent = 0, marketing_consent_at = NULL, token_version = token_version + 1 WHERE id = ?",
      )
      .bind(at, id),
    consentEvent(db, id, "unsubscribe", 1, at),
  ]);
}

// 확인하지 않은 신청(메일 주소, 조건)을 지운다. 매일 정리 cron 과 주간 발송 앞에서 부른다
export async function cleanupPending(db: D1Database, nowMs = Date.now()): Promise<void> {
  const stale = new Date(nowMs - PENDING_HOURS * 3600_000).toISOString();
  await db.batch([
    db.prepare("DELETE FROM profiles WHERE account_id IN (SELECT id FROM accounts WHERE status = 'pending' AND created_at < ?)").bind(stale),
    db.prepare("DELETE FROM consent_events WHERE account_id IN (SELECT id FROM accounts WHERE status = 'pending' AND created_at < ?)").bind(stale),
    db.prepare("DELETE FROM accounts WHERE status = 'pending' AND created_at < ?").bind(stale),
  ]);
}

// 확인·링크 메일을 같은 주소로 5분에 한 번만 보낸다 (메일 폭탄 방지)
export async function claimMailSlot(db: D1Database, id: string, minutes = 5): Promise<boolean> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - minutes * 60_000).toISOString();
  const r = await db
    .prepare("UPDATE accounts SET last_mail_at = ? WHERE id = ? AND (last_mail_at IS NULL OR last_mail_at < ?)")
    .bind(now.toISOString(), id, cutoff)
    .run();
  return (r.meta?.changes ?? 0) > 0;
}

export function marketingValid(a: Account, today = new Date()): boolean {
  if (!a.marketing_consent || !a.marketing_consent_at) return false;
  const age = (today.getTime() - Date.parse(a.marketing_consent_at)) / 86_400_000;
  return age <= MARKETING_VALID_DAYS;
}
