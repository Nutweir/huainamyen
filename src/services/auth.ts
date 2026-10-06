import type { SupabaseClient } from "@supabase/supabase-js";

export interface SessionUser { id: string; email: string }

/**
 * Who is signed in, and are they allowed to edit. The UI uses this to show or hide the admin;
 * the database (RLS) is what actually protects the data.
 */
export interface AuthService {
  readonly kind: "local" | "supabase";
  current(): Promise<SessionUser | null>;
  isEditor(): Promise<boolean>;
  signInWithPassword(email: string, password: string): Promise<void>;
  sendMagicLink(email: string, redirectTo: string): Promise<void>;
  signOut(): Promise<void>;
  onChange(fn: (user: SessionUser | null) => void): () => void;
}

export class SupabaseAuth implements AuthService {
  readonly kind = "supabase" as const;
  constructor(private sb: SupabaseClient) {}

  async current(): Promise<SessionUser | null> {
    const { data } = await this.sb.auth.getSession();
    const u = data.session?.user;
    return u ? { id: u.id, email: u.email || "" } : null;
  }
  async isEditor(): Promise<boolean> {
    const { data, error } = await this.sb.rpc("is_editor");
    return !error && data === true;
  }
  async signInWithPassword(email: string, password: string): Promise<void> {
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message === "Invalid login credentials" ? "อีเมลหรือรหัสผ่านไม่ถูกต้อง" : error.message);
  }
  async sendMagicLink(email: string, redirectTo: string): Promise<void> {
    const { error } = await this.sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo, shouldCreateUser: false } });
    if (error) throw new Error(error.message);
  }
  async signOut(): Promise<void> { await this.sb.auth.signOut(); }
  onChange(fn: (user: SessionUser | null) => void): () => void {
    const { data } = this.sb.auth.onAuthStateChange((_e, session) => fn(session?.user ? { id: session.user.id, email: session.user.email || "" } : null));
    return () => data.subscription.unsubscribe();
  }
}

/** Test login for local mode only: anyone at this keyboard is the owner of this browser's data. */
export class LocalAuth implements AuthService {
  readonly kind = "local" as const;
  private listeners = new Set<(u: SessionUser | null) => void>();
  private key = "journeys-local-session";

  async current(): Promise<SessionUser | null> {
    try { const raw = localStorage.getItem(this.key); return raw ? (JSON.parse(raw) as SessionUser) : null; } catch { return null; }
  }
  async isEditor(): Promise<boolean> { return !!(await this.current()); }
  async signInWithPassword(email: string, password: string): Promise<void> {
    if (password !== "local") throw new Error('โหมดทดสอบ: ใช้รหัสผ่าน "local"');
    const user = { id: "local-owner", email: email || "owner@local" };
    try { localStorage.setItem(this.key, JSON.stringify(user)); } catch { /* private mode */ }
    this.listeners.forEach(f => f(user));
  }
  async sendMagicLink(): Promise<void> { throw new Error("โหมดทดสอบไม่ส่งอีเมล ใช้รหัสผ่าน \"local\""); }
  async signOut(): Promise<void> {
    try { localStorage.removeItem(this.key); } catch { /* nothing stored */ }
    this.listeners.forEach(f => f(null));
  }
  onChange(fn: (u: SessionUser | null) => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
}
