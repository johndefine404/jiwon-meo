// 규칙 기반 매칭: 지역, 사업자 구분, 업력, 업종, 관심 분야, 접수 기간.
// 걸러 내는 규칙은 "확실히 안 맞을 때만" 뺀다. 애매하면 넣고 이유를 적는다.
import { INDUSTRIES, INTERESTS, YEARS, type BizType } from "../data/options";
import type { Program } from "./bizinfo";

export type Profile = {
  id?: number;
  label: string; // 고객 별칭 (컨설턴트) 또는 "내 사업장"
  sido: string;
  sigungu: string; // 비어 있으면 시도 전체
  industry: string;
  bizType: BizType;
  years: string; // YEARS 의 키
  interests: string[]; // 비어 있으면 전 분야
};

export type Match = {
  program: Program;
  score: number;
  dDay: number | null; // 마감까지 남은 날 (0 = 오늘 마감)
  urgent: boolean; // 마감 임박
  upcoming: boolean; // 아직 접수 전
  isNew: boolean; // 최근 7일 안에 올라온 공고
  reasons: string[]; // 왜 맞는지 (메일에 그대로 쓴다)
};

export const URGENT_DAYS = 7;
const DAY = 86_400_000;

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / DAY);
}

function textOf(p: Program): string {
  return `${p.title} ${p.summary} ${p.target} ${p.hashtags.join(" ")}`;
}

// 공고 글에서 업력 조건을 읽는다. "업력 3년 이내", "창업 7년 미만", "업력 1년 이상"
export function yearsLimit(p: Program): { min?: number; max?: number } {
  const t = `${p.title} ${p.summary} ${p.target}`;
  const out: { min?: number; max?: number } = {};
  const max = t.match(/(?:업력|창업(?:\s*후)?)\s*(\d{1,2})\s*년\s*(?:이내|미만|이하)/);
  if (max) out.max = Number(max[1]);
  const min = t.match(/(?:업력|사업\s*영위(?:\s*기간)?)\s*(\d{1,2})\s*년\s*이상/);
  if (min) out.min = Number(min[1]);
  return out;
}

// 공고가 특정 업종만 대상으로 하는지 (제목에 업종 낱말이 있을 때)
export function programIndustries(p: Program): string[] {
  const out: string[] = [];
  for (const [name, words] of Object.entries(INDUSTRIES)) {
    if (words.some((w) => p.title.includes(w))) out.push(name);
  }
  return out;
}

function targetOk(p: Program, biz: BizType): { ok: boolean; reason?: string } {
  const t = p.target + " " + p.title;
  const pre = /예비\s*창업/.test(t);
  const small = /소상공인/.test(t);
  const sme = /중소기업|중소·?벤처|기업/.test(p.target);
  const anyone = !p.target || /누구나|제한\s*없음|개인/.test(p.target);
  if (biz === "예비창업자") {
    if (pre || anyone) return { ok: true, reason: pre ? "예비창업자 대상" : undefined };
    if (/창업/.test(t) && !small) return { ok: true };
    return { ok: false };
  }
  // 예비창업자만 대상인 공고는 이미 사업 중인 곳에 맞지 않는다
  if (pre && !small && !sme && !/기창업|재창업/.test(t)) return { ok: false };
  if (biz === "소상공인") {
    // 소상공인은 중소기업에도 들어간다
    return { ok: true, reason: small ? "소상공인 대상" : undefined };
  }
  // 중소기업(소상공인 아님): 소상공인 전용 공고는 뺀다
  if (small && !sme) return { ok: false };
  return { ok: true };
}

export function matchProgram(p: Program, prof: Profile, today: string): Match | null {
  const reasons: string[] = [];
  let score = 0;

  // 1. 접수 기간
  let dDay: number | null = null;
  if (p.end) {
    dDay = daysBetween(today, p.end);
    if (dDay < 0) return null; // 마감 지남
  }
  const upcoming = !!p.start && daysBetween(today, p.start) > 0;

  // 2. 지역
  if (p.regions.length > 0) {
    if (!p.regions.includes(prof.sido)) return null;
    if (p.sigungu.length > 0) {
      const mine = `${prof.sido} ${prof.sigungu}`;
      const sameSido = p.sigungu.filter((s) => s.startsWith(prof.sido + " "));
      if (sameSido.length > 0) {
        if (prof.sigungu && !sameSido.includes(mine)) return null;
        reasons.push(prof.sigungu ? `${prof.sigungu} 공고` : `${sameSido.map((s) => s.split(" ")[1]).join(", ")} 공고 (시군구 확인 필요)`);
        score += 3;
      } else {
        reasons.push(`${prof.sido} 지역 공고`);
        score += 2;
      }
    } else {
      reasons.push(`${prof.sido} 지역 공고`);
      score += 2;
    }
  } else {
    reasons.push("전국 공고");
  }

  // 3. 사업자 구분
  const t = targetOk(p, prof.bizType);
  if (!t.ok) return null;
  if (t.reason) {
    reasons.push(t.reason);
    score += 1;
  }

  // 4. 업력
  const range = YEARS[prof.years];
  if (range) {
    const lim = yearsLimit(p);
    const [lo, hi] = range;
    if (lim.max !== undefined && lo >= lim.max) return null;
    if (lim.min !== undefined && hi <= lim.min) return null;
    if (lim.max !== undefined) {
      reasons.push(`업력 ${lim.max}년 이내 조건`);
      score += 1;
    }
  }

  // 5. 업종
  const inds = programIndustries(p);
  if (inds.length > 0) {
    if (!inds.includes(prof.industry)) return null;
    reasons.push(`${prof.industry} 대상`);
    score += 3;
  }

  // 6. 관심 분야
  if (prof.interests.length > 0) {
    const text = textOf(p);
    const hit = prof.interests.filter((name) => {
      const rule = INTERESTS[name];
      if (!rule) return false;
      return rule.categories.includes(p.category) || rule.keywords.some((k) => text.includes(k));
    });
    if (hit.length === 0) return null;
    reasons.push(`관심 분야: ${hit.join(", ")}`);
    score += hit.length;
  }

  const urgent = dDay !== null && dDay <= URGENT_DAYS && !upcoming;
  const isNew = !!p.createdAt && daysBetween(p.createdAt, today) <= 7 && daysBetween(p.createdAt, today) >= 0;
  if (urgent) score += 5;
  if (isNew) score += 2;

  return { program: p, score, dDay, urgent, upcoming, isNew, reasons };
}

// 마감 임박이 먼저, 그다음 점수, 그다음 마감이 가까운 순
export function matchAll(programs: Program[], prof: Profile, today: string, limit = 20): { shown: Match[]; total: number } {
  const all = programs
    .map((p) => matchProgram(p, prof, today))
    .filter((m): m is Match => m !== null)
    .sort((a, b) => {
      if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
      if (a.urgent && b.urgent) return (a.dDay ?? 99) - (b.dDay ?? 99);
      if (b.score !== a.score) return b.score - a.score;
      return (a.dDay ?? 999) - (b.dDay ?? 999);
    });
  return { shown: all.slice(0, limit), total: all.length };
}
