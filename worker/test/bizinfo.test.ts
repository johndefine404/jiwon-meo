import { describe, expect, it } from "vitest";
import { buildUrl, detectSigungu, extractItems, loadFixture, normalize, parsePeriod } from "../src/lib/bizinfo";
import fixture from "../fixtures/programs.sample.json";

// 기업마당 문서의 응답 예시 항목 그대로
const DOC_ITEM = {
  title: "착한임대인 장관 표창 신청 연장 공고",
  link: "https://www.bizinfo.go.kr/web/lay1/bbs/S1T122C128/AS/74/view.do?pblancId=PBLN_000000000080236",
  seq: "PBLN_000000000080236",
  author: "중소벤처기업부",
  excInsttNm: "지방중소벤처기업청",
  description: "<div>코로나19라는 힘든 상황속에서 ...</div>",
  lcategory: "경영",
  reqstDt: "20220727 ~ 20220930",
  trgetNm: "중소기업",
  hashTags: "2022,금융,충북,대전,중소벤처기업부",
  pblancNm: "착한임대인 장관 표창 신청 연장 공고",
  pblancId: "PBLN_000000000080236",
  jrsdInsttNm: "중소벤처기업부",
  pldirSportRealmLclasCodeNm: "경영",
  creatPnttm: "2022-09-02 15:38:29",
  reqstBeginEndDe: "20220727 ~ 20220930",
};

describe("기업마당 어댑터", () => {
  it("요청 주소", () => {
    const u = new URL(buildUrl("KEY123", 100));
    expect(u.origin + u.pathname).toBe("https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do");
    expect(u.searchParams.get("crtfcKey")).toBe("KEY123");
    expect(u.searchParams.get("dataType")).toBe("json");
    expect(u.searchParams.get("searchCnt")).toBe("100");
  });

  it("문서 예시 항목을 정리한다", () => {
    const p = normalize(DOC_ITEM)!;
    expect(p.id).toBe("PBLN_000000000080236");
    expect(p.start).toBe("2022-07-27");
    expect(p.end).toBe("2022-09-30");
    expect(p.regions.sort()).toEqual(["대전", "충북"]);
    expect(p.category).toBe("경영");
    expect(p.createdAt).toBe("2022-09-02");
  });

  it("응답 모양 여러 가지를 받는다", () => {
    expect(extractItems({ jsonArray: { item: [DOC_ITEM] } })).toHaveLength(1);
    expect(extractItems({ jsonArray: [DOC_ITEM, DOC_ITEM] })).toHaveLength(2);
    expect(extractItems({ jsonArray: { item: DOC_ITEM } })).toHaveLength(1);
    expect(extractItems("oops")).toEqual([]);
  });

  it("신청기간 읽기", () => {
    expect(parsePeriod("20261001 ~ 20261016")).toEqual({ start: "2026-10-01", end: "2026-10-16", rolling: false });
    expect(parsePeriod("2026-10-01 ~ 2026-10-16")).toEqual({ start: "2026-10-01", end: "2026-10-16", rolling: false });
    expect(parsePeriod("상시 접수").rolling).toBe(true);
    expect(parsePeriod("20261001 ~ 예산 소진시까지")).toEqual({ start: "2026-10-01", end: null, rolling: true });
    expect(parsePeriod("").rolling).toBe(true);
  });

  it("시군구는 그 공고의 시도 안에서 낱말 단위로만 찾는다", () => {
    expect(detectSigungu(["서울"], "서울 중구청 상권 지원")).toEqual(["서울 중구"]);
    expect(detectSigungu(["서울"], "중구조조정 지원")).toEqual([]);
    expect(detectSigungu(["경기"], "수원시 골목상권")).toEqual(["경기 수원시"]);
  });

  it("예시 데이터는 날짜를 오늘에 맞춰 옮긴다", () => {
    const base = loadFixture(fixture as any).find((p) => p.id === "SAMPLE_0001")!;
    const moved = loadFixture(fixture as any, "2026-10-19").find((p) => p.id === "SAMPLE_0001")!;
    expect(base.end).toBe("2026-10-16");
    expect(moved.end).toBe("2026-10-23");
    expect(moved.sample).toBe(true);
  });
});
