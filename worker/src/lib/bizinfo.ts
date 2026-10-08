// 기업마당 지원사업정보 API 어댑터.
// 문서: https://www.bizinfo.go.kr/apiDetail.do?id=bizinfoApi
// 요청: GET https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do?crtfcKey=...&dataType=json&searchCnt=...
// 실제 키로 호출해 본 적이 없다. 응답 모양은 문서 예시 기준이며, 여러 모양을 받아들이도록 짰다.
import { REGIONS, SIDO, SIDO_ALIASES, SIDO_LONG } from "../data/options";

export const BIZINFO_ENDPOINT = "https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do";

// 문서의 응답 항목 중 쓰는 것만
export type BizinfoItem = {
  pblancId?: string;
  seq?: string;
  pblancNm?: string;
  title?: string;
  pblancUrl?: string;
  link?: string;
  jrsdInsttNm?: string;
  author?: string;
  excInsttNm?: string;
  bsnsSumryCn?: string;
  description?: string;
  pldirSportRealmLclasCodeNm?: string;
  lcategory?: string;
  trgetNm?: string;
  hashTags?: string;
  hashtags?: string;
  reqstBeginEndDe?: string;
  reqstDt?: string;
  creatPnttm?: string;
  pubDate?: string;
  refrncNm?: string;
  rceptEngnHmpgUrl?: string;
};

export type Program = {
  id: string;
  title: string;
  url: string;
  agency: string; // 소관기관
  execAgency: string; // 수행기관
  summary: string; // 사업개요 (HTML 제거)
  category: string; // 지원분야 대분류
  target: string; // 지원대상
  hashtags: string[];
  period: string; // 신청기간 원문
  start: string | null; // YYYY-MM-DD
  end: string | null; // YYYY-MM-DD, 상시·소진 시까지는 null
  rolling: boolean; // 상시 접수, 예산 소진 시까지 등
  createdAt: string | null; // YYYY-MM-DD
  regions: string[]; // 시도. 비어 있으면 전국
  sigungu: string[]; // 공고에 적힌 시군구 (regions 안에서 찾은 것만)
  applyUrl: string;
  contact: string;
  sample?: boolean; // 예시 데이터 표시
};

export function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function ymd(raw: string): string | null {
  const m = raw.match(/(\d{4})[-.]?(\d{2})[-.]?(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// "20260901 ~ 20261015", "2026-09-01 ~ 2026-10-15", "상시 접수", "예산 소진시까지" 등
export function parsePeriod(raw: string | undefined): { start: string | null; end: string | null; rolling: boolean } {
  const s = (raw || "").trim();
  if (!s) return { start: null, end: null, rolling: true };
  const parts = s.split("~").map((p) => p.trim());
  const start = parts[0] ? ymd(parts[0]) : null;
  const end = parts.length > 1 && parts[1] ? ymd(parts[1]) : null;
  // 끝 날짜가 없으면 상시 접수, 예산 소진 시까지 같은 공고로 본다
  return { start, end, rolling: !end };
}

export function parseHashtags(raw: string | undefined): string[] {
  return (raw || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

// 공고가 대상으로 하는 시도: 해시태그 + 제목 앞 [경기] 같은 머리표 + 긴 시도명
export function detectRegions(hashtags: string[], text: string): string[] {
  const out = new Set<string>();
  for (const t of hashtags) {
    if (SIDO.includes(t)) out.add(t);
    if (SIDO_ALIASES[t]) SIDO_ALIASES[t].forEach((x) => out.add(x));
  }
  const head = text.match(/^\s*\[([^\]]+)\]/);
  if (head) {
    for (const part of head[1].split(/[·,\/\s]+/)) {
      if (SIDO.includes(part)) out.add(part);
      if (SIDO_LONG[part]) out.add(SIDO_LONG[part]);
    }
  }
  for (const [long, short] of Object.entries(SIDO_LONG)) {
    if (text.includes(long)) out.add(short);
  }
  return [...out];
}

// 공고 제목·기관명에 나온 시군구 (그 공고의 시도 안에서만 찾는다)
export function detectSigungu(regions: string[], text: string): string[] {
  const out = new Set<string>();
  for (const sido of regions) {
    for (const name of REGIONS[sido] || []) {
      // 두 글자 구 이름(중구, 서구 등)은 다른 낱말 안에 잘 섞이므로 앞뒤가 글자가 아닐 때만 인정
      const re = new RegExp(`(^|[^가-힣])${name}([^가-힣]|청|$)`);
      if (re.test(text)) out.add(`${sido} ${name}`);
    }
  }
  return [...out];
}

export function normalize(item: BizinfoItem, opts: { sample?: boolean } = {}): Program | null {
  const id = item.pblancId || item.seq;
  const title = stripHtml(item.pblancNm || item.title || "");
  if (!id || !title) return null;
  const hashtags = parseHashtags(item.hashTags ?? item.hashtags);
  const agency = (item.jrsdInsttNm || item.author || "").trim();
  const execAgency = (item.excInsttNm || "").trim();
  const regionText = `${title} ${agency} ${execAgency}`;
  const regions = detectRegions(hashtags, title + " " + execAgency);
  const { start, end, rolling } = parsePeriod(item.reqstBeginEndDe ?? item.reqstDt);
  const created = item.creatPnttm || item.pubDate || "";
  return {
    id,
    title,
    url: item.pblancUrl || item.link || `https://www.bizinfo.go.kr/web/lay1/bbs/S1T122C128/AS/74/view.do?pblancId=${encodeURIComponent(id)}`,
    agency,
    execAgency,
    summary: stripHtml(item.bsnsSumryCn || item.description || ""),
    category: (item.pldirSportRealmLclasCodeNm || item.lcategory || "").trim(),
    target: (item.trgetNm || "").trim(),
    hashtags,
    period: (item.reqstBeginEndDe ?? item.reqstDt ?? "").trim(),
    start,
    end,
    rolling,
    createdAt: created ? ymd(created) : null,
    regions,
    sigungu: detectSigungu(regions, regionText),
    applyUrl: (item.rceptEngnHmpgUrl || "").trim(),
    contact: stripHtml(item.refrncNm || ""),
    sample: opts.sample || undefined,
  };
}

// 문서의 JSON 예시는 {"jsonArray": {..., "item": [...]}} 모양이다.
// 실제 응답이 {"jsonArray": [...]} 이거나 {"item": [...]} 여도 받는다.
export function extractItems(body: unknown): BizinfoItem[] {
  const b = body as any;
  if (!b || typeof b !== "object") return [];
  const ja = b.jsonArray ?? b;
  if (Array.isArray(ja)) return ja;
  if (Array.isArray(ja.item)) return ja.item;
  if (ja.item && typeof ja.item === "object") return [ja.item];
  if (Array.isArray(b.items)) return b.items;
  return [];
}

export function buildUrl(key: string, searchCnt = 500): string {
  const u = new URL(BIZINFO_ENDPOINT);
  u.searchParams.set("crtfcKey", key);
  u.searchParams.set("dataType", "json");
  u.searchParams.set("searchCnt", String(searchCnt));
  return u.toString();
}

// 실제 API 호출 (키가 있을 때만). 시험되지 않은 경로.
export async function fetchLive(key: string, fetcher: typeof fetch = fetch): Promise<Program[]> {
  const res = await fetcher(buildUrl(key), { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`bizinfo ${res.status}`);
  const body = await res.json();
  return extractItems(body)
    .map((i) => normalize(i))
    .filter((p): p is Program => p !== null);
}

const DAY = 86_400_000;

function shiftYmd(s: string | null, days: number): string | null {
  if (!s) return s;
  const d = new Date(s + "T00:00:00Z");
  return new Date(d.getTime() + days * DAY).toISOString().slice(0, 10);
}

// 예시 데이터는 기준일(anchor)에 맞춰 날짜를 적어 두었다. 로컬 시험에서는 오늘에 맞게 옮긴다.
export function loadFixture(
  fixture: { anchor: string; items: BizinfoItem[] },
  today?: string,
): Program[] {
  const shift = today ? Math.round((Date.parse(today + "T00:00:00Z") - Date.parse(fixture.anchor + "T00:00:00Z")) / DAY) : 0;
  return fixture.items
    .map((i) => normalize(i, { sample: true }))
    .filter((p): p is Program => p !== null)
    .map((p) => ({
      ...p,
      start: shiftYmd(p.start, shift),
      end: shiftYmd(p.end, shift),
      createdAt: shiftYmd(p.createdAt, shift),
      period: p.rolling ? p.period : `${(shiftYmd(p.start, shift) || "").replace(/-/g, "")} ~ ${(shiftYmd(p.end, shift) || "").replace(/-/g, "")}`,
    }));
}
