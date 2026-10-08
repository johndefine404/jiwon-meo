// [Define404] 지원냥 (jiwon-meo): 조건에 맞는 정부지원사업을 매주 메일로 보내는 소상공인용 알리미
// 화면(public/)은 정적 파일로 나가고, /api/* 와 주간 발송(cron)을 이 워커가 맡는다.
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import fixture from "../fixtures/programs.sample.json";
import type { Env } from "./env";
import { loadFixture, type BizinfoItem } from "./lib/bizinfo";
import { buildDigest } from "./lib/digest";
import { matchAll, type Profile } from "./lib/match";
import { fallbackSummary } from "./lib/summary";
import { kstDate, runWeekly } from "./cron";
import api from "./routes/api";

const app = new Hono<{ Bindings: Env }>();

// 보안 머리말 (정적 파일은 public/_headers 가 맡는다)
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
  c.header("Cache-Control", "no-store");
});

// 접속자별 요청 제한 (1분에 10번)
app.use("/api/*", async (c, next) => {
  if (c.env.LIMITER && c.req.method !== "GET") {
    const key = c.req.header("CF-Connecting-IP") || "unknown";
    const { success } = await c.env.LIMITER.limit({ key });
    if (!success) return c.json({ ok: false, error: "요청이 많습니다. 잠시 후 다시 시도해 주세요" }, 429);
  }
  await next();
});

// 다른 사이트의 폼이 이 API 로 대신 신청하지 못하게 (같은 주소에서 온 요청만)
app.use("/api/*", async (c, next) => {
  const origin = c.req.header("Origin");
  if (c.req.method !== "GET" && origin && c.req.path !== "/api/unsubscribe") {
    const self = new URL(c.req.url).origin;
    const pub = (c.env.PUBLIC_URL || "").replace(/\/$/, "");
    if (origin !== self && origin !== pub) return c.json({ ok: false, error: "origin not allowed" }, 403);
  }
  await next();
});

app.use("/api/*", bodyLimit({ maxSize: 32 * 1024, onError: (c) => c.json({ ok: false, error: "요청이 너무 큽니다" }, 413) }));

app.get("/health", (c) => c.json({ ok: true }));
app.route("/api", api);

// 로컬 시험 전용: 예시 데이터로 만든 주간 메일 미리보기 (MOCK=1 일 때만 열린다)
app.get("/dev/digest", (c) => {
  if (c.env.MOCK !== "1") return c.json({ error: "not found" }, 404);
  const today = c.req.query("today") || kstDate(Date.now());
  const programs = loadFixture(fixture as { anchor: string; items: BizinfoItem[] }, today);
  const summaries = Object.fromEntries(programs.map((p) => [p.id, fallbackSummary(p)]));
  const consultant = c.req.query("kind") === "consultant";
  const owner: Profile = { label: "내 사업장", sido: "경기", sigungu: "수원시", industry: "음식점·카페", bizType: "소상공인", years: "1~3년", interests: ["자금", "마케팅", "판로", "경영"] };
  const profiles: Profile[] = consultant
    ? [
        { ...owner, label: "수원 국밥집" },
        { label: "부산 미용실", sido: "부산", sigungu: "해운대구", industry: "미용·생활서비스", bizType: "소상공인", years: "3~7년", interests: ["인력", "자금"] },
        { label: "판교 SW 스타트업", sido: "경기", sigungu: "성남시", industry: "IT·소프트웨어", bizType: "중소기업", years: "1년 미만", interests: ["창업", "기술", "수출"] },
      ]
    : [owner];
  const digest = buildDigest({
    kind: consultant ? "consultant" : "owner",
    groups: profiles.map((profile) => {
      const r = matchAll(programs, profile, today, consultant ? 10 : 20);
      return { profile, matches: r.shown, total: r.total };
    }),
    summaries,
    today,
    subscribedAt: today,
    marketing: c.req.query("marketing") !== "0",
    adLabel: c.env.AD_LABEL !== "0",
    links: { manage: "#manage", unsubscribe: "#unsubscribe", contact: c.env.CONTACT_URL, site: c.env.PUBLIC_URL },
    senderInfo: c.env.SENDER_INFO,
    sample: true,
  });
  if (c.req.query("format") === "text") return c.text(digest.text);
  return c.html(digest.html);
});

app.notFound((c) => c.json({ error: "not found" }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ ok: false, error: "잠시 후 다시 시도해 주세요" }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runWeekly(env, event.scheduledTime));
  },
} satisfies ExportedHandler<Env>;

export { app };
