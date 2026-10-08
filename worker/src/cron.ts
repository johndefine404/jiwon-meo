// 매주 월요일 09:00 (한국 시간) 실행: 공고 받기 -> 요약 -> 구독자별 메일 만들어 보내기
import fixture from "../fixtures/programs.sample.json";
import type { Env } from "./env";
import { fetchLive, loadFixture, type BizinfoItem, type Program } from "./lib/bizinfo";
import { buildDigest, type DigestGroup } from "./lib/digest";
import { sendMail } from "./lib/mail";
import { link, unsubscribeUrls } from "./lib/notices";
import { matchAll } from "./lib/match";
import { getProfiles, marketingValid, type Account } from "./lib/store";
import { summarize } from "./lib/summary";

export const BATCH = 200; // 한 번 실행에 보내는 계정 수 (넘으면 다음 실행에서 이어 보낸다)
const AI_PER_RUN = 50;

export function kstDate(ms: number): string {
  return new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);
}

export async function loadPrograms(env: Env, today: string): Promise<{ programs: Program[]; sample: boolean }> {
  if (env.BIZINFO_API_KEY && env.MOCK !== "1") {
    return { programs: await fetchLive(env.BIZINFO_API_KEY), sample: false };
  }
  return { programs: loadFixture(fixture as { anchor: string; items: BizinfoItem[] }, today), sample: true };
}

// 공고를 DB 에 저장하고, 요약이 없는 것만 새로 만든다 (AI 호출은 실행당 상한)
export async function refreshPrograms(env: Env, programs: Program[]): Promise<Record<string, string>> {
  const db = env.DB;
  const { results } = await db.prepare("SELECT id, summary FROM programs").all<{ id: string; summary: string | null }>();
  const cached = new Map((results || []).map((r) => [r.id, r.summary]));
  const summaries: Record<string, string> = {};
  let aiCalls = 0;
  const at = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [db.prepare("DELETE FROM programs")];
  for (const p of programs) {
    let s = cached.get(p.id) ?? null;
    if (!s && aiCalls < AI_PER_RUN) {
      s = await summarize(env, p);
      if (env.USE_AI_SUMMARY === "1") aiCalls++;
    }
    summaries[p.id] = s ?? "";
    stmts.push(db.prepare("INSERT INTO programs (id, data, summary, fetched_at) VALUES (?,?,?,?)").bind(p.id, JSON.stringify(p), s, at));
  }
  await db.batch(stmts);
  return summaries;
}

export async function buildFor(
  env: Env,
  acc: Account,
  programs: Program[],
  summaries: Record<string, string>,
  today: string,
  sample: boolean,
) {
  const profiles = await getProfiles(env.DB, acc.id);
  const groups: DigestGroup[] = profiles.map((profile) => {
    const { shown, total } = matchAll(programs, profile, today, acc.kind === "consultant" ? 10 : 20);
    return { profile, matches: shown, total };
  });
  const manage = await link(env, "manage", "manage", acc.id, acc.token_version);
  const unsub = await unsubscribeUrls(env, acc.id, acc.token_version);
  const digest = buildDigest({
    kind: acc.kind,
    groups,
    summaries,
    today,
    subscribedAt: (acc.confirmed_at || acc.created_at).slice(0, 10),
    marketing: marketingValid(acc),
    adLabel: env.AD_LABEL !== "0",
    links: { manage, unsubscribe: unsub.page, contact: env.CONTACT_URL, site: env.PUBLIC_URL },
    senderInfo: env.SENDER_INFO,
    sample,
  });
  return { digest, unsub };
}

export async function runWeekly(env: Env, scheduledMs = Date.now()): Promise<{ week: string; sent: number; skipped: number; programs: number }> {
  const today = kstDate(scheduledMs);
  const week = today;
  const db = env.DB;

  // 48시간 넘게 확인하지 않은 신청은 지운다
  const stale = new Date(scheduledMs - 3 * 86_400_000).toISOString();
  await db.batch([
    db.prepare("DELETE FROM profiles WHERE account_id IN (SELECT id FROM accounts WHERE status = 'pending' AND created_at < ?)").bind(stale),
    db.prepare("DELETE FROM accounts WHERE status = 'pending' AND created_at < ?").bind(stale),
  ]);

  const { programs, sample } = await loadPrograms(env, today);
  const summaries = await refreshPrograms(env, programs);

  const { results } = await db
    .prepare(
      "SELECT * FROM accounts WHERE status = 'active' AND email IS NOT NULL AND id NOT IN (SELECT account_id FROM sends WHERE week = ?) LIMIT ?",
    )
    .bind(week, BATCH)
    .all<Account>();

  let sent = 0;
  let skipped = 0;
  for (const acc of results || []) {
    try {
      const { digest, unsub } = await buildFor(env, acc, programs, summaries, today, sample);
      if (digest.count > 0) {
        await sendMail(env, {
          to: acc.email!,
          subject: digest.subject,
          html: digest.html,
          text: digest.text,
          headers: {
            "List-Unsubscribe": `<${unsub.oneClick}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        });
        sent++;
      } else {
        skipped++; // 맞는 공고가 없으면 보내지 않는다
      }
      await db
        .prepare("INSERT INTO sends (account_id, week, sent_at, items) VALUES (?,?,?,?)")
        .bind(acc.id, week, new Date().toISOString(), digest.count)
        .run();
    } catch (e) {
      console.error("digest failed", acc.id, e);
    }
  }
  console.log(`[cron] week=${week} programs=${programs.length} sample=${sample} sent=${sent} skipped=${skipped}`);
  return { week, sent, skipped, programs: programs.length };
}
