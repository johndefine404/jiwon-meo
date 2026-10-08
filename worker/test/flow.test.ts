import { describe, expect, it } from "vitest";
import { app } from "../src/index";
import { runDaily, runWeekly } from "../src/cron";
import { makeEnv, tokenFrom } from "./helpers";

const owner = {
  label: "무시됨",
  sido: "경기",
  sigungu: "수원시",
  industry: "음식점·카페",
  bizType: "소상공인",
  years: "1~3년",
  interests: ["마케팅", "판로", "자금", "경영"],
};

function post(env: any, path: string, body: unknown, headers: Record<string, string> = {}) {
  return app.request(path, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) }, env);
}

async function subscribeAndConfirm(env: any, sink: any[], email: string, extra: Record<string, unknown> = {}) {
  const r = await post(env, "/api/subscribe", { email, kind: "owner", profiles: [owner], privacy: true, marketing: false, ...extra });
  expect(r.status).toBe(200);
  const mail = sink.at(-1)!;
  expect(mail.to).toBe(email.toLowerCase());
  const ct = tokenFrom(mail.text, "confirm");
  const c = await post(env, "/api/confirm", { token: ct });
  expect(c.status).toBe(200);
  const { manageUrl } = (await c.json()) as any;
  return manageUrl.split("#t=")[1] as string;
}

// 매주 실행 시각: 2026-10-12(월) 00:00 UTC = 09:00 KST
const MONDAY = Date.parse("2026-10-12T00:00:00Z");

describe("구독 흐름", () => {
  it("개인정보 동의 없이는 구독할 수 없다", async () => {
    const { env } = makeEnv();
    const r = await post(env, "/api/subscribe", { email: "a@example.com", kind: "owner", profiles: [owner], privacy: false });
    expect(r.status).toBe(400);
  });

  it("잘못된 조건은 거절", async () => {
    const { env } = makeEnv();
    const r = await post(env, "/api/subscribe", { email: "a@example.com", kind: "owner", profiles: [{ ...owner, sigungu: "해운대구" }], privacy: true });
    expect(r.status).toBe(400);
  });

  it("신청 -> 확인 메일 -> 확정 -> 조건 보기·바꾸기 -> 수신 거부", async () => {
    const { env, sink } = makeEnv();
    const manage = await subscribeAndConfirm(env, sink, "Owner@Example.com ".trim());
    expect(sink[0].subject).toContain("확인");
    expect(sink[0].text).not.toContain("(광고)");

    const g = await app.request("/api/manage", { headers: { Authorization: `Bearer ${manage}` } }, env);
    expect(g.status).toBe(200);
    const data = (await g.json()) as any;
    expect(data.email).toBe("owner@example.com");
    expect(data.profiles[0].label).toBe("내 사업장");

    const put = await app.request(
      "/api/manage",
      { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${manage}` }, body: JSON.stringify({ profiles: [{ ...owner, sigungu: "" }], marketing: true }) },
      env,
    );
    expect(put.status).toBe(200);
    const acc = env.DB.raw.prepare("SELECT * FROM accounts").get();
    expect(acc.marketing_consent).toBe(1);
    expect(env.DB.raw.prepare("SELECT sigungu FROM profiles").get().sigungu).toBe("");

    const u = await post(env, "/api/unsubscribe", { token: manage });
    expect(u.status).toBe(200);
    const after = env.DB.raw.prepare("SELECT * FROM accounts").get();
    expect(after.status).toBe("unsubscribed");
    expect(after.email).toBeNull();
    expect(env.DB.raw.prepare("SELECT count(*) n FROM profiles").get().n).toBe(0);
    // 이전 링크는 더 이상 쓸 수 없다
    const again = await app.request("/api/manage", { headers: { Authorization: `Bearer ${manage}` } }, env);
    expect(again.status).toBe(401);
  });

  it("이미 구독 중인 주소로 다시 신청하면 조건은 그대로 두고 링크 메일만 보낸다", async () => {
    const { env, sink } = makeEnv();
    await subscribeAndConfirm(env, sink, "dup@example.com");
    env.DB.raw.prepare("UPDATE accounts SET last_mail_at = NULL").run();
    const r = await post(env, "/api/subscribe", { email: "dup@example.com", kind: "owner", profiles: [{ ...owner, sido: "서울", sigungu: "" }], privacy: true });
    expect(((await r.json()) as any).message).toContain("확인 메일");
    expect(sink.at(-1)!.subject).toContain("조건 바꾸기");
    expect(env.DB.raw.prepare("SELECT sido FROM profiles").get().sido).toBe("경기");
  });

  it("확인 메일은 5분에 한 번만", async () => {
    const { env, sink } = makeEnv();
    await post(env, "/api/subscribe", { email: "x@example.com", kind: "owner", profiles: [owner], privacy: true });
    await post(env, "/api/subscribe", { email: "x@example.com", kind: "owner", profiles: [owner], privacy: true });
    expect(sink).toHaveLength(1);
  });

  it("남의 계정은 볼 수 없다 (토큰의 계정만 쓴다)", async () => {
    const { env, sink } = makeEnv();
    const a = await subscribeAndConfirm(env, sink, "a@example.com");
    await subscribeAndConfirm(env, sink, "b@example.com");
    const r = await app.request("/api/manage", { headers: { Authorization: `Bearer ${a}` } }, env);
    expect(((await r.json()) as any).email).toBe("a@example.com");
    // 확인 토큰이나 수신 거부 토큰으로는 조건 화면을 열 수 없다
    const confirmTok = tokenFrom(sink[0].text, "confirm");
    expect((await app.request("/api/manage", { headers: { Authorization: `Bearer ${confirmTok}` } }, env)).status).toBe(401);
    expect((await app.request("/api/manage", {}, env)).status).toBe(401);
  });

  it("다른 사이트에서 온 요청과 너무 잦은 요청은 막는다", async () => {
    const { env } = makeEnv();
    const r = await post(env, "/api/subscribe", { email: "o@example.com" }, { Origin: "https://evil.example" });
    expect(r.status).toBe(403);
    env.LIMITER = { limit: async () => ({ success: false }) };
    const r2 = await post(env, "/api/subscribe", { email: "o@example.com" });
    expect(r2.status).toBe(429);
  });
});

describe("주간 발송", () => {
  it("구독자별 메일, 왜 받는지, 수신 거부 링크, 같은 주 중복 발송 없음", async () => {
    const { env, sink } = makeEnv();
    await subscribeAndConfirm(env, sink, "owner@example.com");
    sink.length = 0;
    const res = await runWeekly(env, MONDAY);
    expect(res.sent).toBe(1);
    const mail = sink[0];
    expect(mail.subject.startsWith("[지원냥]")).toBe(true); // 광고 수신 동의 없음: (광고) 없음
    expect(mail.text).toContain("구독을 신청하고 메일 확인을 마치셔서 받으시는 메일");
    expect(mail.text).not.toContain("신청서 작성 도움 문의");
    expect(mail.html).not.toContain("신청서 작성 도움 문의");
    expect(mail.text).toContain("[마감 D-3]");
    expect(mail.text).toContain("예시 데이터");
    expect(mail.headers!["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");

    // 같은 주에 다시 돌려도 보내지 않는다
    expect((await runWeekly(env, MONDAY)).sent).toBe(0);

    // 메일의 수신 거부 링크가 동작한다 (메일 앱의 한 번 누르기 방식)
    const oneClick = mail.headers!["List-Unsubscribe"].slice(1, -1);
    const u = await app.request(new URL(oneClick).pathname + new URL(oneClick).search, { method: "POST", body: "List-Unsubscribe=One-Click", headers: { "Content-Type": "application/x-www-form-urlencoded" } }, env);
    expect(u.status).toBe(200);
    // 화면 링크의 토큰도 같은 계정을 가리킨다 (이미 거부됐으니 이제 무효)
    const pageTok = tokenFrom(mail.text, "unsubscribe");
    expect((await post(env, "/api/unsubscribe", { token: pageTok })).status).toBe(401);
    sink.length = 0;
    expect((await runWeekly(env, MONDAY + 7 * 86_400_000)).sent).toBe(0);
  });

  it("광고 수신에 동의한 사람만 (광고) 제목과 문의 버튼", async () => {
    const { env, sink } = makeEnv();
    await subscribeAndConfirm(env, sink, "ad@example.com", { marketing: true });
    sink.length = 0;
    await runWeekly(env, MONDAY);
    expect(sink[0].subject.startsWith("(광고) [지원냥]")).toBe(true);
    expect(sink[0].html).toContain("신청서 작성 도움 문의");
    expect(sink[0].text).toContain("보내는 곳: Define404");
    expect(sink[0].text).toContain("문의: https://contact.define404.com");
    expect(sink[0].text).toContain("광고 수신만 거부: https://jiwon.example.com/adoff#t=");
    expect(sink[0].html).toContain("광고 수신만 거부");
  });

  it("광고 동의·철회마다 처리 결과 메일, 광고 수신만 거부해도 지원사업 메일은 계속", async () => {
    const { env, sink } = makeEnv();
    await subscribeAndConfirm(env, sink, "ad2@example.com", { marketing: true });
    // 확정하면서 동의 처리 결과 알림
    expect(sink.at(-1)!.subject).toBe("[지원냥] 광고성 정보 수신 동의 처리 결과 안내");
    expect(sink.at(-1)!.text).not.toContain("신청서 작성 도움 문의"); // 알림에는 광고를 넣지 않는다
    sink.length = 0;
    await runWeekly(env, MONDAY);
    const adOff = tokenFrom(sink[0].text, "adoff");
    sink.length = 0;
    const r = await post(env, "/api/marketing-off", { token: adOff });
    expect(r.status).toBe(200);
    expect(env.DB.raw.prepare("SELECT marketing_consent FROM accounts").get().marketing_consent).toBe(0);
    expect(sink[0].subject).toBe("[지원냥] 광고성 정보 수신 철회 처리 결과 안내");
    expect(env.DB.raw.prepare("SELECT value FROM consent_events WHERE kind = 'marketing' ORDER BY id DESC").get().value).toBe(0);
    sink.length = 0;
    await runWeekly(env, MONDAY + 7 * 86_400_000);
    expect(sink).toHaveLength(1);
    expect(sink[0].subject.startsWith("[지원냥]")).toBe(true);
    expect(sink[0].text).not.toContain("신청서 작성 도움 문의");
  });

  it("조건 바꾸기 화면에서 동의를 바꿔도 결과 메일, 수신 거부 때도 철회 결과 메일", async () => {
    const { env, sink } = makeEnv();
    const manage = await subscribeAndConfirm(env, sink, "m@example.com");
    sink.length = 0;
    const put = (marketing: boolean) =>
      app.request(
        "/api/manage",
        { method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${manage}` }, body: JSON.stringify({ profiles: [owner], marketing }) },
        env,
      );
    expect((await put(true)).status).toBe(200);
    expect(sink.at(-1)!.subject).toContain("동의 처리 결과");
    expect((await put(false)).status).toBe(200);
    expect(sink.at(-1)!.subject).toContain("철회 처리 결과");
    expect(sink).toHaveLength(2);
    await put(true);
    sink.length = 0;
    await post(env, "/api/unsubscribe", { token: manage });
    expect(sink).toHaveLength(1);
    expect(sink[0].to).toBe("m@example.com");
    expect(sink[0].subject).toContain("철회 처리 결과");
  });

  it("밤 9시부터 아침 8시 사이 발송과 2년 지난 동의에는 광고를 넣지 않는다", async () => {
    const { env, sink } = makeEnv();
    await subscribeAndConfirm(env, sink, "night@example.com", { marketing: true });
    sink.length = 0;
    await runWeekly(env, Date.parse("2026-10-12T13:00:00Z")); // 22:00 KST
    expect(sink[0].subject.startsWith("[지원냥]")).toBe(true);
    expect(sink[0].html).not.toContain("신청서 작성 도움 문의");

    env.DB.raw.prepare("UPDATE accounts SET marketing_consent_at = '2024-01-01T00:00:00.000Z'").run();
    sink.length = 0;
    await runWeekly(env, MONDAY + 7 * 86_400_000);
    expect(sink[0].subject.startsWith("[지원냥]")).toBe(true);
    expect(sink[0].text).not.toContain("광고 수신만 거부");
  });

  it("컨설턴트: 고객별로 묶어 한 통", async () => {
    const { env, sink } = makeEnv();
    const clients = [
      { ...owner, label: "수원 국밥집" },
      { label: "부산 미용실", sido: "부산", sigungu: "해운대구", industry: "미용·생활서비스", bizType: "소상공인", years: "3~7년", interests: ["인력"] },
    ];
    const r = await post(env, "/api/subscribe", { email: "tax@example.com", kind: "consultant", profiles: clients, privacy: true });
    expect(r.status).toBe(200);
    await post(env, "/api/confirm", { token: tokenFrom(sink[0].text, "confirm") });
    sink.length = 0;
    await runWeekly(env, MONDAY);
    expect(sink).toHaveLength(1);
    const t = sink[0].text;
    expect(sink[0].subject).toContain("고객 2곳");
    const a = t.indexOf("== 수원 국밥집");
    const b = t.indexOf("== 부산 미용실");
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    // 부산 고객 묶음에는 부산 고용 장려금만, 수원 고객 묶음에는 들어가지 않는다
    expect(t.slice(b)).toContain("부산] 소상공인 신규 고용 장려금");
    expect(t.slice(a, b)).not.toContain("부산] 소상공인 신규 고용 장려금");
  });

  it("컨설턴트 고객 수 상한, 사장님은 조건 하나", async () => {
    const { env } = makeEnv();
    const many = Array.from({ length: 31 }, (_, i) => ({ ...owner, label: `고객${i}` }));
    expect((await post(env, "/api/subscribe", { email: "c@example.com", kind: "consultant", profiles: many, privacy: true })).status).toBe(400);
    expect((await post(env, "/api/subscribe", { email: "d@example.com", kind: "owner", profiles: [owner, owner], privacy: true })).status).toBe(400);
  });

  it("확인하지 않은 신청에는 보내지 않고 3일 안에 지운다 (매일 정리)", async () => {
    const { env } = makeEnv();
    await post(env, "/api/subscribe", { email: "p@example.com", kind: "owner", profiles: [owner], privacy: true });
    expect((await runWeekly(env, Date.now())).sent).toBe(0);
    await runDaily(env, Date.now() + 24 * 3600_000);
    expect(env.DB.raw.prepare("SELECT count(*) n FROM accounts").get().n).toBe(1);
    await runDaily(env, Date.now() + 49 * 3600_000);
    expect(env.DB.raw.prepare("SELECT count(*) n FROM accounts").get().n).toBe(0);
    expect(env.DB.raw.prepare("SELECT count(*) n FROM profiles").get().n).toBe(0);
  });
});
