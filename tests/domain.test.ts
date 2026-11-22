import { describe, it, expect } from "vitest";
import { estimateVolumeLiters } from "@/lib/domain/volume";
import { rangeStatus } from "@/lib/domain/ranges";
import { occurrences, overlaps } from "@/lib/domain/recurrence";
import { parseMoneyToCents } from "@/lib/format";

describe("volume", () => {
  it("retangular usa profundidade média", () => {
    expect(estimateVolumeLiters({ shape: "retangular", lengthM: 8, widthM: 4, depthMinM: 1.2, depthMaxM: 1.8 })).toBe(48000);
  });
  it("irregular não estima", () => {
    expect(estimateVolumeLiters({ shape: "irregular", lengthM: 8, widthM: 4, depthMinM: 1, depthMaxM: 2 })).toBeNull();
  });
  it("faltando medida não estima", () => {
    expect(estimateVolumeLiters({ shape: "retangular", lengthM: 8, widthM: null, depthMinM: 1 })).toBeNull();
  });
});

describe("faixas", () => {
  it("sem faixa não julga", () => expect(rangeStatus(7.4, null, null)).toBe("no_range"));
  it("abaixo/acima/dentro", () => {
    expect(rangeStatus(1, 2, 4)).toBe("below");
    expect(rangeStatus(5, 2, 4)).toBe("above");
    expect(rangeStatus(2, 2, 4)).toBe("in_range");
  });
  it("não medido", () => expect(rangeStatus(null, 1, 2)).toBe("not_measured"));
});

describe("recorrência", () => {
  it("terça e sexta toda semana", () => {
    // 2026-11-03 é terça
    const d = occurrences({ weekdays: [2, 5], intervalWeeks: 1, startsOn: "2026-11-03" }, "2026-11-01", "2026-11-14");
    expect(d).toEqual(["2026-11-03", "2026-11-06", "2026-11-10", "2026-11-13"]);
  });
  it("quinzenal pula semanas alternadas e respeita feriado", () => {
    const d = occurrences({ weekdays: [1], intervalWeeks: 2, startsOn: "2026-11-02" }, "2026-11-01", "2026-12-01", new Set(["2026-11-30"]));
    expect(d).toEqual(["2026-11-02", "2026-11-16"]);
  });
  it("respeita data de término", () => {
    const d = occurrences({ weekdays: [1], intervalWeeks: 1, startsOn: "2026-11-02", endsOn: "2026-11-10" }, "2026-11-01", "2026-12-01");
    expect(d).toEqual(["2026-11-02", "2026-11-09"]);
  });
  it("sobreposição de horários", () => {
    const a = new Date("2026-11-03T11:00:00Z");
    expect(overlaps(a, 60, new Date("2026-11-03T11:30:00Z"), 60)).toBe(true);
    expect(overlaps(a, 60, new Date("2026-11-03T12:00:00Z"), 60)).toBe(false);
  });
});

describe("dinheiro", () => {
  it("aceita formato brasileiro", () => {
    expect(parseMoneyToCents("1.234,56")).toBe(123456);
    expect(parseMoneyToCents("R$ 99,9")).toBe(9990);
    expect(parseMoneyToCents("150")).toBe(15000);
    expect(parseMoneyToCents("")).toBeNull();
  });
});
