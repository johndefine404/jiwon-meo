import { describe, expect, it } from "vitest";
import { signToken, verifyToken } from "../src/lib/token";
import { SECRET } from "./helpers";

const NOW = 1_800_000_000;

function flip(s: string, i: number) {
  const c = s[i] === "A" ? "B" : "A";
  return s.slice(0, i) + c + s.slice(i + 1);
}

describe("서명 토큰", () => {
  it("맞는 토큰은 통과", async () => {
    const t = await signToken(SECRET, "manage", "acc-1", 3, NOW);
    expect(await verifyToken(SECRET, t, "manage", NOW + 10)).toMatchObject({ p: "manage", a: "acc-1", v: 3 });
  });

  it("내용을 바꾼 토큰은 거절 (다른 계정 ID 로 바꿔치기)", async () => {
    const t = await signToken(SECRET, "manage", "acc-1", 1, NOW);
    const [body, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ p: "manage", a: "acc-2", v: 1, e: NOW + 9999 })).toString("base64url");
    expect(await verifyToken(SECRET, `${forged}.${sig}`, "manage", NOW)).toBeNull();
    expect(await verifyToken(SECRET, `${flip(body, 3)}.${sig}`, "manage", NOW)).toBeNull();
    expect(await verifyToken(SECRET, `${body}.${flip(sig, 5)}`, "manage", NOW)).toBeNull();
  });

  it("용도가 다르면 거절", async () => {
    const t = await signToken(SECRET, "unsub", "acc-1", 1, NOW);
    expect(await verifyToken(SECRET, t, "manage", NOW)).toBeNull();
  });

  it("만료되면 거절", async () => {
    const t = await signToken(SECRET, "confirm", "acc-1", 1, NOW);
    expect(await verifyToken(SECRET, t, "confirm", NOW + 2 * 24 * 3600 - 1)).not.toBeNull();
    expect(await verifyToken(SECRET, t, "confirm", NOW + 2 * 24 * 3600 + 1)).toBeNull();
  });

  it("다른 비밀값으로 만든 토큰은 거절", async () => {
    const t = await signToken("another-secret-another-secret-0000000", "manage", "acc-1", 1, NOW);
    expect(await verifyToken(SECRET, t, "manage", NOW)).toBeNull();
  });

  it("모양이 틀린 값은 거절", async () => {
    for (const bad of ["", "abc", "a.b.c", "....", "x".repeat(700)]) {
      expect(await verifyToken(SECRET, bad, "manage", NOW)).toBeNull();
    }
  });

  it("짧은 비밀값은 쓰지 않는다", async () => {
    await expect(signToken("short", "manage", "a", 1)).rejects.toThrow();
  });
});
