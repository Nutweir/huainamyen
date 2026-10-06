import { createClient } from "@supabase/supabase-js";
import type { ContentRepository } from "./repository";
import type { AuthService } from "./auth";
import { LocalAuth, SupabaseAuth } from "./auth";
import { SupabaseRepository } from "./supabase/SupabaseRepository";
import { LocalRepository } from "./local/LocalRepository";
import type { SiteSettings, TripBundle } from "@/types/content";

/** Seeds for local mode: every migrated journal in src/content/seed. */
async function loadSeed(): Promise<{ bundles: TripBundle[]; site: SiteSettings }> {
  const files = import.meta.glob<{ default: unknown }>("@/content/seed/*.json");
  const bundles: TripBundle[] = [];
  let site: SiteSettings = { title: "Journeys by Nutweir", tagline: "", aboutHtml: "", author: "Nutweir" };
  for (const [path, load] of Object.entries(files)) {
    const data = (await load()).default;
    if (path.endsWith("/site.json")) site = data as SiteSettings;
    else bundles.push(data as TripBundle);
  }
  return { bundles, site };
}

export interface Backend { repo: ContentRepository; auth: AuthService; configured: boolean }

function make(): Backend {
  const env = import.meta.env;
  const wantSupabase = env.VITE_BACKEND === "supabase" || (!env.VITE_BACKEND && env.VITE_SUPABASE_URL);
  if (wantSupabase) {
    if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
      console.error("VITE_BACKEND=supabase but VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing — falling back to local mode");
    } else {
      const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
      return { repo: new SupabaseRepository(sb, env.VITE_SUPABASE_URL), auth: new SupabaseAuth(sb), configured: true };
    }
  }
  return { repo: new LocalRepository(loadSeed), auth: new LocalAuth(), configured: false };
}

let backend: Backend | null = null;
export function useBackend(): Backend {
  return (backend ||= make());
}
/** Tests swap in their own backend. */
export function setBackend(b: Backend): void { backend = b; }
