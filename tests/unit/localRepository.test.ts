import { describe, expect, it } from "vitest";
import seed from "@/content/seed/huai-nam-yen.json";
import site from "@/content/seed/site.json";
import type { SiteSettings, TripBundle } from "@/types/content";
import { LocalRepository } from "@/services/local/LocalRepository";
import { ConflictError } from "@/services/repository";

const make = () => new LocalRepository(async () => ({ bundles: [seed as unknown as TripBundle], site: site as SiteSettings }), "/", `test-${Math.random()}`);

describe("local repository (same rules as the database)", () => {
  it("readers see only published trips", async () => {
    const repo = make();
    const id = await repo.createTrip({ title: "ร่าง", slug: "draft-trip", startDate: "2027-01-01", endDate: null, location: "" });
    expect((await repo.listPublished()).map(t => t.slug)).toEqual(["huai-nam-yen"]);
    expect(await repo.getPublished("draft-trip")).toBeNull();
    expect((await repo.listTrips()).some(t => t.id === id)).toBe(true);
  });

  it("a draft edit is invisible until published, then appears", async () => {
    const repo = make();
    const [{ id }] = await repo.listTrips();
    const { bundle, savedAt } = await repo.loadTrip(id);
    const p = bundle.days[0].blocks.find(b => b.type === "paragraph")!;
    if (p.type === "paragraph") p.data.html += " [แก้]";
    await repo.saveTrip(bundle, savedAt);
    expect(JSON.stringify(await repo.getPublished("huai-nam-yen"))).not.toContain("[แก้]");
    await repo.publishTrip((await repo.loadTrip(id)).bundle);
    expect(JSON.stringify(await repo.getPublished("huai-nam-yen"))).toContain("[แก้]");
  });

  it("refuses to overwrite a newer save (conflict)", async () => {
    const repo = make();
    const [{ id }] = await repo.listTrips();
    const { bundle, savedAt } = await repo.loadTrip(id);
    await repo.saveTrip(bundle, savedAt);
    await expect(repo.saveTrip(bundle, savedAt)).rejects.toBeInstanceOf(ConflictError);
  });

  it("unpublishing hides the trip; versions can be read back", async () => {
    const repo = make();
    const [{ id }] = await repo.listTrips();
    await repo.setStatus(id, "draft");
    expect(await repo.getPublished("huai-nam-yen")).toBeNull();
    await repo.setStatus(id, "published");
    expect(await repo.getPublished("huai-nam-yen")).not.toBeNull();
    const versions = await repo.listVersions(id);
    expect(versions.length).toBeGreaterThan(0);
    expect((await repo.getVersion(versions[0].id)).snapshot.trip.slug).toBe("huai-nam-yen");
  });

  it("duplicating makes a separate draft with a new slug", async () => {
    const repo = make();
    const [{ id }] = await repo.listTrips();
    const copy = await repo.duplicateTrip(id);
    const { bundle } = await repo.loadTrip(copy);
    expect(bundle.trip.slug).toBe("huai-nam-yen-copy");
    expect(bundle.trip.status).toBe("draft");
    expect(await repo.getPublished("huai-nam-yen-copy")).toBeNull();
  });
});
