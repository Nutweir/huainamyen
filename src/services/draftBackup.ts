import { openDB, type IDBPDatabase } from "idb";
import type { TripBundle } from "@/types/content";

/*
 * Every edit is copied here (this browser's IndexedDB) before it is sent to the server,
 * so a dropped connection or a closed tab never loses writing. Cleared once the server has it.
 */
interface Backup { tripId: string; bundle: TripBundle; basedOn: string | null; at: string }

let db: Promise<IDBPDatabase> | null = null;
const open = () => (db ||= openDB("journeys-drafts", 1, { upgrade: d => { d.createObjectStore("drafts", { keyPath: "tripId" }); } }));

export async function keepDraft(bundle: TripBundle, basedOn: string | null): Promise<void> {
  try { await (await open()).put("drafts", { tripId: bundle.trip.id, bundle: JSON.parse(JSON.stringify(bundle)), basedOn, at: new Date().toISOString() } satisfies Backup); }
  catch { /* storage unavailable (private mode): autosave still runs */ }
}
export async function readDraft(tripId: string): Promise<Backup | null> {
  try { return ((await (await open()).get("drafts", tripId)) as Backup | undefined) || null; } catch { return null; }
}
export async function dropDraft(tripId: string): Promise<void> {
  try { await (await open()).delete("drafts", tripId); } catch { /* nothing to drop */ }
}
