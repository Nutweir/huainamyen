import { defineStore } from "pinia";
import { ref } from "vue";
import { useBackend } from "@/services";
import type { SessionUser } from "@/services/auth";

/** Session state for the admin. The route guard reads it; RLS in the database is the real gate. */
export const useAuthStore = defineStore("auth", () => {
  const { auth } = useBackend();
  const user = ref<SessionUser | null>(null);
  const isEditor = ref(false);
  const error = ref("");

  async function refresh(u: SessionUser | null) {
    user.value = u;
    isEditor.value = u ? await auth.isEditor().catch(() => false) : false;
  }
  const ready: Promise<void> = auth.current().then(refresh).catch(() => refresh(null));
  auth.onChange(u => { void refresh(u); });

  async function signIn(email: string, password: string) {
    error.value = "";
    await auth.signInWithPassword(email, password);
    await refresh(await auth.current());
    if (!isEditor.value) error.value = "บัญชีนี้ไม่มีสิทธิ์แก้ไขเว็บไซต์";
  }
  async function magicLink(email: string, redirectTo: string) { await auth.sendMagicLink(email, redirectTo); }
  async function signOut() { await auth.signOut(); await refresh(null); }

  return { user, isEditor, error, ready, signIn, magicLink, signOut, kind: auth.kind };
});
