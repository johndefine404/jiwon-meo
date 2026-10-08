// 주간 메일 만들기 (HTML + 글자판). 컨설턴트는 고객별로 묶는다.
import type { Match, Profile } from "./match";

export type DigestGroup = { profile: Profile; matches: Match[]; total: number };

export type DigestInput = {
  kind: "owner" | "consultant";
  groups: DigestGroup[];
  summaries: Record<string, string>;
  today: string; // YYYY-MM-DD
  subscribedAt: string; // 구독 확인한 날 YYYY-MM-DD
  marketing: boolean; // 광고성 안내를 넣는가 (유효한 수신 동의가 있고, 한국 시간 08~21시에 보낼 때만)
  links: { manage: string; unsubscribe: string; adOff: string; contact: string; site: string };
  senderInfo: string;
  sample: boolean; // 예시 데이터로 만든 메일
};

export type Digest = { subject: string; html: string; text: string; count: number; urgent: number };

const BIZINFO_LIST = "https://www.bizinfo.go.kr/web/lay1/bbs/S1T122C128/AS/74/list.do";
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function koDate(ymd: string): string {
  const d = new Date(ymd + "T00:00:00Z");
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일(${WEEKDAY[d.getUTCDay()]})`;
}

export function conditionText(p: Profile): string {
  const where = p.sigungu ? `${p.sido} ${p.sigungu}` : `${p.sido} 전체`;
  const interests = p.interests.length ? p.interests.join(", ") : "전 분야";
  return `${where} · ${p.industry} · ${p.bizType} · 업력 ${p.years} · 관심 ${interests}`;
}

export function badges(m: Match): { label: string; tone: "urgent" | "new" | "plain" }[] {
  const out: { label: string; tone: "urgent" | "new" | "plain" }[] = [];
  if (m.urgent) out.push({ label: m.dDay === 0 ? "오늘 마감" : `마감 D-${m.dDay}`, tone: "urgent" });
  if (m.upcoming && m.program.start) out.push({ label: `접수 예정 ${koDate(m.program.start)}`, tone: "plain" });
  if (m.program.rolling) out.push({ label: "상시 접수", tone: "plain" });
  if (m.isNew) out.push({ label: "새 공고", tone: "new" });
  return out;
}

function periodText(m: Match): string {
  const p = m.program;
  if (p.rolling) return p.period && !/^\d/.test(p.period) ? p.period : "상시 접수";
  const s = p.start ? koDate(p.start) : "";
  return `${s} ~ ${p.end ? koDate(p.end) : ""}`.trim();
}

const C = {
  ink: "#1B1F1D",
  sub: "#5B605C",
  line: "#E3E0D8",
  paper: "#F7F5F0",
  accent: "#1F6B4F",
  urgent: "#B42318",
  urgentBg: "#FDECEA",
  newBg: "#E6F2EC",
  plainBg: "#EFEDE7",
};

const FONT = `-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic','맑은 고딕',sans-serif`;

function badgeHtml(b: { label: string; tone: string }): string {
  const bg = b.tone === "urgent" ? C.urgentBg : b.tone === "new" ? C.newBg : C.plainBg;
  const fg = b.tone === "urgent" ? C.urgent : b.tone === "new" ? C.accent : C.sub;
  return `<span style="display:inline-block;margin:0 6px 6px 0;padding:2px 8px;border-radius:4px;background:${bg};color:${fg};font-size:12px;font-weight:700">${esc(b.label)}</span>`;
}

function itemHtml(m: Match, summary: string): string {
  const p = m.program;
  const bs = badges(m).map(badgeHtml).join("");
  const border = m.urgent ? C.urgent : C.line;
  return `<tr><td style="padding:0 0 14px 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${border};border-radius:6px;background:#FFFFFF">
<tr><td style="padding:16px 18px">
${bs ? `<div>${bs}</div>` : ""}
<a href="${esc(p.url)}" style="color:${C.ink};font-size:16px;font-weight:700;line-height:1.45;text-decoration:none">${esc(p.title)}</a>
<div style="margin-top:6px;color:${C.sub};font-size:13px;line-height:1.6">${esc(p.agency)}${p.execAgency ? " · " + esc(p.execAgency) : ""}<br>신청 ${esc(periodText(m))}</div>
${summary ? `<div style="margin-top:8px;color:${C.ink};font-size:14px;line-height:1.6">${esc(summary)}</div>` : ""}
<div style="margin-top:8px;color:${C.sub};font-size:12px;line-height:1.6">맞는 이유: ${esc(m.reasons.join(", "))}</div>
<div style="margin-top:10px"><a href="${esc(p.url)}" style="color:${C.accent};font-size:13px;font-weight:700">공고 원문 보기</a></div>
</td></tr></table>
</td></tr>`;
}

function itemText(m: Match, summary: string): string {
  const bs = badges(m).map((b) => `[${b.label}]`).join(" ");
  return [
    `${bs ? bs + " " : ""}${m.program.title}`,
    `  ${m.program.agency}${m.program.execAgency ? " · " + m.program.execAgency : ""} / 신청 ${periodText(m)}`,
    summary ? `  ${summary}` : "",
    `  맞는 이유: ${m.reasons.join(", ")}`,
    `  ${m.program.url}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildDigest(input: DigestInput): Digest {
  const count = input.groups.reduce((n, g) => n + g.matches.length, 0);
  const urgent = input.groups.reduce((n, g) => n + g.matches.filter((m) => m.urgent).length, 0);
  const consultant = input.kind === "consultant";
  // 광고성 문구(문의 버튼)는 동의한 사람에게만 넣고, 넣으면 제목 앞에 반드시 (광고)를 붙인다
  const ad = input.marketing;
  const prefix = ad ? "(광고) " : "";
  const subject = consultant
    ? `${prefix}[지원냥] 고객 ${input.groups.length}곳, 이번 주 지원사업 ${count}건 (마감 임박 ${urgent}건)`
    : `${prefix}[지원냥] 이번 주 맞는 지원사업 ${count}건 (마감 임박 ${urgent}건)`;

  const why = `${koDate(input.subscribedAt)}에 지원냥 구독을 신청하고 메일 확인을 마치셔서 받으시는 메일입니다. 아래 조건에 맞는 공고를 매주 월요일 오전에 보내 드립니다.`;
  const sampleNote = "이 메일은 예시 데이터로 만들었습니다. 실제 공고가 아닙니다.";

  // HTML
  const groupsHtml = input.groups
    .map((g) => {
      const head = consultant
        ? `<tr><td style="padding:18px 0 4px 0;font-size:18px;font-weight:800;color:${C.ink}">${esc(g.profile.label)} <span style="font-size:13px;font-weight:600;color:${C.sub}">${g.matches.length}건</span></td></tr>`
        : "";
      const cond = `<tr><td style="padding:0 0 12px 0;font-size:12px;color:${C.sub};line-height:1.6">조건: ${esc(conditionText(g.profile))}</td></tr>`;
      const items = g.matches.length
        ? g.matches.map((m) => itemHtml(m, input.summaries[m.program.id] ?? "")).join("")
        : `<tr><td style="padding:0 0 14px 0;font-size:14px;color:${C.sub}">이번 주에는 조건에 맞는 공고가 없습니다.</td></tr>`;
      const more =
        g.total > g.matches.length
          ? `<tr><td style="padding:0 0 14px 0;font-size:13px;color:${C.sub}">외 ${g.total - g.matches.length}건은 <a href="${BIZINFO_LIST}" style="color:${C.accent}">기업마당</a>에서 보실 수 있습니다.</td></tr>`
          : "";
      return head + cond + items + more;
    })
    .join("");

  const cta = ad
    ? `<tr><td style="padding:8px 0 20px 0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper};border:1px solid ${C.line};border-radius:6px"><tr><td style="padding:16px 18px">
<div style="font-size:12px;color:${C.sub};margin-bottom:4px">(광고) Define404</div>
<div style="font-size:15px;font-weight:700;color:${C.ink};line-height:1.5">사업계획서와 신청서 작성이 막막하시면 도와드립니다</div>
<div style="font-size:13px;color:${C.sub};line-height:1.6;margin-top:4px">공고 조건 확인부터 제출 서류 정리까지 함께 봐 드립니다.</div>
<div style="margin-top:10px"><a href="${esc(input.links.contact)}" style="display:inline-block;padding:9px 14px;border-radius:4px;background:${C.ink};color:#FFFFFF;font-size:13px;font-weight:700;text-decoration:none">신청서 작성 도움 문의</a></div>
</td></tr></table></td></tr>`
    : "";

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.paper};word-break:keep-all">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;font-family:${FONT};color:${C.ink}">
<tr><td style="padding:0 0 6px 0;font-size:13px;font-weight:800;color:${C.accent}"><img src="${esc(input.links.site.replace(/\/$/, ""))}/logo-email.png" width="24" height="24" alt="" style="vertical-align:middle;border:0;margin-right:6px">지원냥</td></tr>
<tr><td style="padding:0 0 6px 0;font-size:22px;font-weight:800;line-height:1.4">${koDate(input.today)} 지원사업 소식</td></tr>
<tr><td style="padding:0 0 16px 0;font-size:14px;color:${C.sub};line-height:1.6">${consultant ? `고객 ${input.groups.length}곳의 조건에 맞는 공고 ${count}건입니다.` : `조건에 맞는 공고 ${count}건입니다.`} 마감 임박(7일 이내) ${urgent}건을 맨 위에 두었습니다.</td></tr>
${input.sample ? `<tr><td style="padding:0 0 14px 0;font-size:13px;font-weight:700;color:${C.urgent}">${sampleNote}</td></tr>` : ""}
${groupsHtml}
${cta}
<tr><td style="padding:16px 0 0 0;border-top:1px solid ${C.line};font-size:12px;color:${C.sub};line-height:1.7">
${esc(why)}<br>
신청 자격과 마감일은 반드시 공고 원문에서 다시 확인해 주세요. 공고 정보 출처: 기업마당(bizinfo.go.kr).<br>
<a href="${esc(input.links.manage)}" style="color:${C.accent}">조건 바꾸기</a> · <a href="${esc(input.links.unsubscribe)}" style="color:${C.accent}">수신 거부</a>${
    ad ? ` · <a href="${esc(input.links.adOff)}" style="color:${C.accent}">광고 수신만 거부</a>` : ""
  }<br>
${ad ? "광고성 정보 수신에 동의하셔서 Define404 안내가 함께 실렸습니다. 광고 수신만 거부하셔도 지원사업 메일은 계속 받으시며, 거부에 드는 비용은 없습니다.<br>" : ""}보내는 곳: ${esc(input.senderInfo)} · 문의: <a href="${esc(input.links.contact)}" style="color:${C.accent}">${esc(input.links.contact)}</a>
</td></tr>
</table></td></tr></table></body></html>`;

  // 글자판
  const lines: string[] = [];
  lines.push(`지원냥 ${koDate(input.today)} 지원사업 소식`);
  lines.push(consultant ? `고객 ${input.groups.length}곳, 공고 ${count}건, 마감 임박 ${urgent}건` : `조건에 맞는 공고 ${count}건, 마감 임박 ${urgent}건`);
  if (input.sample) lines.push(sampleNote);
  for (const g of input.groups) {
    lines.push("");
    if (consultant) lines.push(`== ${g.profile.label} (${g.matches.length}건) ==`);
    lines.push(`조건: ${conditionText(g.profile)}`);
    if (!g.matches.length) lines.push("이번 주에는 조건에 맞는 공고가 없습니다.");
    for (const m of g.matches) {
      lines.push("");
      lines.push(itemText(m, input.summaries[m.program.id] ?? ""));
    }
    if (g.total > g.matches.length) lines.push(`외 ${g.total - g.matches.length}건: ${BIZINFO_LIST}`);
  }
  if (ad) {
    lines.push("");
    lines.push("(광고) Define404: 사업계획서와 신청서 작성이 막막하시면 도와드립니다.");
    lines.push(`신청서 작성 도움 문의: ${input.links.contact}`);
  }
  lines.push("");
  lines.push(why);
  lines.push("신청 자격과 마감일은 반드시 공고 원문에서 다시 확인해 주세요. 공고 정보 출처: 기업마당(bizinfo.go.kr).");
  lines.push(`조건 바꾸기: ${input.links.manage}`);
  lines.push(`수신 거부: ${input.links.unsubscribe}`);
  if (ad) {
    lines.push(`광고 수신만 거부: ${input.links.adOff}`);
    lines.push("광고성 정보 수신에 동의하셔서 Define404 안내가 함께 실렸습니다. 광고 수신만 거부하셔도 지원사업 메일은 계속 받으시며, 거부에 드는 비용은 없습니다.");
  }
  lines.push(`보내는 곳: ${input.senderInfo} · 문의: ${input.links.contact}`);

  return { subject, html, text: lines.join("\n"), count, urgent };
}
