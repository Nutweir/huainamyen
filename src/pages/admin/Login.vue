<script setup lang="ts">
/* Sign in to the admin. Supabase Auth (password or e-mail link); in local test mode the password is "local". */
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useAdminBody } from "@/composables/useAdminBody";

useAdminBody();
const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const email = ref("");
const password = ref("");
const busy = ref(false);
const msg = ref(route.query.denied ? "บัญชีนี้ไม่มีสิทธิ์แก้ไขเว็บไซต์" : "");
const sent = ref(false);
const next = () => (typeof route.query.next === "string" && route.query.next.startsWith("/admin") ? route.query.next : "/admin");

async function submit() {
  busy.value = true; msg.value = "";
  try {
    await auth.signIn(email.value.trim(), password.value);
    if (auth.isEditor) await router.replace(next());
    else msg.value = auth.error;
  } catch (e) { msg.value = (e as Error).message; }
  finally { busy.value = false; password.value = ""; }
}
async function link() {
  if (!email.value.trim()) { msg.value = "ใส่อีเมลก่อน"; return; }
  busy.value = true; msg.value = "";
  try {
    await auth.magicLink(email.value.trim(), `${location.origin}${import.meta.env.BASE_URL}admin`);
    sent.value = true;
  } catch (e) { msg.value = (e as Error).message; }
  finally { busy.value = false; }
}
</script>

<template>
  <main class="grid min-h-dvh place-items-center px-4">
    <form class="card w-full max-w-sm p-6" @submit.prevent="submit">
      <p class="text-xs uppercase tracking-[.2em] text-muted">Journeys by Nutweir</p>
      <h1 class="mt-1 font-display text-2xl">เข้าสู่ระบบหลังบ้าน</h1>
      <p v-if="auth.kind === 'local'" class="mt-3 rounded-lg bg-[#fbf3df] px-3 py-2 text-sm">
        โหมดทดสอบในเครื่อง (ยังไม่ได้เชื่อม Supabase) — ข้อมูลเก็บในเบราว์เซอร์นี้เท่านั้น · รหัสผ่าน <code>local</code>
      </p>
      <label class="field mt-4"><span>อีเมล</span><input v-model="email" class="input" type="email" autocomplete="username" required></label>
      <label class="field mt-3"><span>รหัสผ่าน</span><input v-model="password" class="input" type="password" autocomplete="current-password" required></label>
      <p v-if="msg" class="mt-3 text-sm text-danger" role="alert">{{ msg }}</p>
      <p v-if="sent" class="mt-3 text-sm text-forest" role="status">ส่งลิงก์เข้าสู่ระบบไปที่อีเมลแล้ว</p>
      <button class="btn mt-4 w-full" :disabled="busy">{{ busy ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ" }}</button>
      <button v-if="auth.kind === 'supabase'" type="button" class="btn btn-ghost mt-2 w-full" :disabled="busy" @click="link">ส่งลิงก์เข้าสู่ระบบทางอีเมล</button>
      <RouterLink to="/" class="mt-4 block text-center text-sm text-muted underline">← กลับไปหน้าเว็บ</RouterLink>
    </form>
  </main>
</template>
