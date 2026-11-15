import { describe, expect, it } from "vitest";
import { addMonths, ageFromDob, nyLocalToUtc, utcToNyParts } from "@/lib/time";

describe("New York time handling", () => {
  it("converts winter (EST) wall time to UTC", () => {
    expect(nyLocalToUtc("2026-12-01", "14:30").toISOString()).toBe("2026-12-01T19:30:00.000Z");
  });
  it("converts summer (EDT) wall time to UTC", () => {
    expect(nyLocalToUtc("2026-07-01", "14:30").toISOString()).toBe("2026-07-01T18:30:00.000Z");
  });
  it("handles the day DST ends", () => {
    expect(nyLocalToUtc("2026-11-01", "09:00").toISOString()).toBe("2026-11-01T14:00:00.000Z");
  });
  it("round-trips", () => {
    expect(utcToNyParts("2026-03-09T01:15:00Z")).toEqual({ date: "2026-03-08", time: "21:15" });
  });
  it("adds months without overflowing short months", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-11-14", 36)).toBe("2029-11-14");
  });
  it("computes ages", () => {
    expect(ageFromDob("2021-03-04", "2026-11-14")).toBe("5 years");
    expect(ageFromDob("2026-05-20", "2026-11-14")).toBe("5 months");
  });
});
