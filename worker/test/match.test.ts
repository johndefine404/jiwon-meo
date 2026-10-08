import { describe, expect, it } from "vitest";
import { matchAll, matchProgram, yearsLimit } from "../src/lib/match";
import { badges } from "../src/lib/digest";
import { TODAY, profile, programs } from "./helpers";

const ids = (p = profile(), today = TODAY) => matchAll(programs(), p, today, 100).shown.map((m) => m.program.id);

describe("매칭 규칙 (예시 데이터)", () => {
  it("수원 음식점 소상공인 1~3년: 맞는 공고만 남는다", () => {
    const got = ids();
    for (const id of ["SAMPLE_0001", "SAMPLE_0002", "SAMPLE_0003", "SAMPLE_0006", "SAMPLE_0012", "SAMPLE_0013", "SAMPLE_0016"]) expect(got).toContain(id);
    expect(got).not.toContain("SAMPLE_0004"); // 서울 공고
    expect(got).not.toContain("SAMPLE_0005"); // 예비창업자 전용
    expect(got).not.toContain("SAMPLE_0007"); // 제조 업종 공고
    expect(got).not.toContain("SAMPLE_0009"); // 부산 공고
    expect(got).not.toContain("SAMPLE_0010"); // 마감 지남
    expect(got).not.toContain("SAMPLE_0011"); // 전남·광주 공고
    expect(got).not.toContain("SAMPLE_0014"); // 성남시 공고
    expect(got).not.toContain("SAMPLE_0015"); // 업력 7년 이상 조건
  });

  it("시군구가 다르면 시군구 공고를 빼고, 시군구를 비우면 넣되 확인 필요로 적는다", () => {
    expect(ids(profile({ sigungu: "성남시" }))).toContain("SAMPLE_0014");
    expect(ids(profile({ sigungu: "성남시" }))).not.toContain("SAMPLE_0003");
    const m = matchProgram(programs().find((p) => p.id === "SAMPLE_0003")!, profile({ sigungu: "" }), TODAY)!;
    expect(m).not.toBeNull();
    expect(m.reasons.join(" ")).toContain("시군구 확인 필요");
  });

  it("예비창업자는 예비창업 공고를 받고 소상공인 자금은 받지 않는다", () => {
    const got = ids(profile({ bizType: "예비창업자", years: "예비창업(사업자 없음)" }));
    expect(got).toContain("SAMPLE_0005");
    expect(got).not.toContain("SAMPLE_0001");
  });

  it("업력 조건: 7년 이상이면 창업 3년 이내 공고를 빼고 도약기 공고를 받는다", () => {
    expect(yearsLimit(programs().find((p) => p.id === "SAMPLE_0006")!)).toEqual({ max: 3 });
    const got = ids(profile({ bizType: "중소기업", years: "7년 이상" }));
    expect(got).not.toContain("SAMPLE_0006");
    expect(got).toContain("SAMPLE_0015");
  });

  it("중소기업(소상공인 아님)은 소상공인 전용 공고를 받지 않는다", () => {
    const got = ids(profile({ bizType: "중소기업" }));
    expect(got).not.toContain("SAMPLE_0001");
    expect(got).toContain("SAMPLE_0008");
  });

  it("관심 분야로 거른다", () => {
    const got = ids(profile({ interests: ["마케팅"] }));
    expect(got).toContain("SAMPLE_0003");
    expect(got).toContain("SAMPLE_0002");
    expect(got).not.toContain("SAMPLE_0001");
    const money = ids(profile({ interests: ["자금"] }));
    expect(money).toContain("SAMPLE_0001");
    expect(money).not.toContain("SAMPLE_0003");
  });

  it("업종 공고는 그 업종에만 간다", () => {
    expect(ids(profile({ sido: "서울", sigungu: "마포구" }))).toContain("SAMPLE_0004");
    expect(ids(profile({ sido: "서울", sigungu: "마포구", industry: "제조" }))).not.toContain("SAMPLE_0004");
  });

  it("전남광주 해시태그는 광주와 전남 둘 다에 맞는다", () => {
    const p = { industry: "숙박·관광", sigungu: "" };
    expect(ids(profile({ ...p, sido: "광주" }))).toContain("SAMPLE_0011");
    expect(ids(profile({ ...p, sido: "전남" }))).toContain("SAMPLE_0011");
    expect(ids(profile({ ...p, sido: "서울" }))).not.toContain("SAMPLE_0011");
  });
});

describe("마감 임박 강조", () => {
  it("7일 이내 마감은 맨 위에, 마감이 가까운 순으로", () => {
    const { shown } = matchAll(programs(), profile(), TODAY);
    const urgent = shown.filter((m) => m.urgent);
    expect(urgent.map((m) => [m.program.id, m.dDay])).toEqual([
      ["SAMPLE_0012", 3],
      ["SAMPLE_0001", 4],
      ["SAMPLE_0003", 7],
    ]);
    expect(shown.slice(0, 3).every((m) => m.urgent)).toBe(true);
  });

  it("배지: D-n, 오늘 마감, 접수 예정, 상시, 새 공고", () => {
    const ps = programs();
    const m12 = matchProgram(ps.find((p) => p.id === "SAMPLE_0012")!, profile(), TODAY)!;
    expect(badges(m12).map((b) => b.label)).toEqual(["마감 D-3", "새 공고"]);
    const lastDay = matchProgram(ps.find((p) => p.id === "SAMPLE_0012")!, profile(), "2026-10-15")!;
    expect(badges(lastDay)[0].label).toBe("오늘 마감");
    expect(matchProgram(ps.find((p) => p.id === "SAMPLE_0012")!, profile(), "2026-10-16")).toBeNull();
    const m13 = matchProgram(ps.find((p) => p.id === "SAMPLE_0013")!, profile(), TODAY)!;
    expect(m13.upcoming).toBe(true);
    expect(m13.urgent).toBe(false);
    expect(badges(m13)[0].label).toContain("접수 예정");
    const m9 = matchProgram(ps.find((p) => p.id === "SAMPLE_0009")!, profile({ sido: "부산", sigungu: "해운대구" }), TODAY)!;
    expect(m9.dDay).toBeNull();
    expect(badges(m9).map((b) => b.label)).toContain("상시 접수");
  });
});
