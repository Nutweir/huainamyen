import { describe, expect, it } from "vitest";
import { emptyBundle } from "@/services/factory";
import { TRIP_TEMPLATES, applyTemplate, endDateFor, suggestSlug } from "@/services/tripTemplates";

const tpl = (id: string) => TRIP_TEMPLATES.find(t => t.id === id)!;

describe("starting a new trip", () => {
  it("a weekend template makes two dated days of moments, with no story text", () => {
    const b = applyTemplate(emptyBundle({ title: "ทดสอบ", slug: "t", startDate: "2027-02-27", endDate: null, location: "" }), tpl("weekend"));
    expect(b.days.map(d => d.date)).toEqual(["2027-02-27", "2027-02-28"]);
    expect(b.days[0].blocks.map(x => x.type === "event" && x.data.time)).toEqual(["เช้า", "บ่าย", "เย็น", "ค่ำ"]);
    expect(b.days.flatMap(d => d.blocks).every(x => x.type === "event" && x.data.title === "")).toBe(true);
    expect(b.trip.durationLabel).toBe("2 Days / 1 Night");
  });

  it("works out the last day across month ends", () => {
    expect(endDateFor("2027-02-27", tpl("three"))).toBe("2027-03-01");
    expect(endDateFor("2027-02-27", tpl("blank"))).toBe("2027-02-27");
  });

  it("a Thai title still gets a link, from the start date", () => {
    expect(suggestSlug("ดอยหลวง", "2027-02-01")).toBe("trip-2027-02-01");
    expect(suggestSlug("Doi Luang", "2027-02-01")).toBe("doi-luang");
  });
});
