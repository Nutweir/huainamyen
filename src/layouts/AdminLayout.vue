<script setup lang="ts">
/* Admin frame: navigation, who is signed in, and the toast. */
import { ref } from "vue";
import { RouterLink, RouterView, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useAdminBody } from "@/composables/useAdminBody";
import { useToast } from "@/composables/useToast";

useAdminBody();
const auth = useAuthStore();
const router = useRouter();
const { text, bad } = useToast();
const open = ref(false);
const base = import.meta.env.BASE_URL;
const nav = [
  { to: "/admin", label: "ภาพรวม", exact: true },
  { to: "/admin/trips", label: "ทริป" },
  { to: "/admin/media", label: "คลังรูปและวิดีโอ" },
  { to: "/admin/settings", label: "ตั้งค่าและสำรองข้อมูล" },
];
async function signOut() { await auth.signOut(); await router.replace("/admin/login"); }
</script>

<template>
  <div class="min-h-dvh">
    <header class="sticky top-0 z-30 border-b border-[#ece6da] bg-[#faf8f3]/95 backdrop-blur">
      <div class="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4">
        <RouterLink to="/admin" class="whitespace-nowrap font-display text-lg">Journeys <span class="text-muted">· หลังบ้าน</span></RouterLink>
        <button class="ml-auto rounded-lg border border-rule px-3 py-1 text-sm lg:hidden" :aria-expanded="open" aria-controls="admin-nav" @click="open = !open">เมนู</button>
        <nav id="admin-nav" class="absolute left-0 right-0 top-14 border-b border-[#ece6da] bg-[#faf8f3] p-3 lg:static lg:ml-6 lg:flex lg:border-0 lg:bg-transparent lg:p-0" :class="open ? 'block' : 'hidden lg:flex'" aria-label="เมนูหลังบ้าน">
          <RouterLink
            v-for="n in nav" :key="n.to" :to="n.to" class="block whitespace-nowrap rounded-lg px-3 py-2 text-sm lg:py-1"
            :exact-active-class="n.exact ? 'bg-[#eee8dc] font-semibold' : ''" :active-class="n.exact ? '' : 'bg-[#eee8dc] font-semibold'" @click="open = false"
          >{{ n.label }}</RouterLink>
          <div class="mt-2 flex items-center gap-3 border-t border-[#ece6da] px-3 pt-3 text-sm lg:hidden">
            <span class="truncate text-muted">{{ auth.user?.email }}</span>
            <a :href="base" class="underline">ดูหน้าเว็บ</a>
            <button class="btn btn-ghost ml-auto min-h-8 px-3" @click="signOut">ออกจากระบบ</button>
          </div>
        </nav>
        <div class="hidden items-center gap-3 text-sm lg:ml-auto lg:flex">
          <span v-if="auth.kind === 'local'" class="chip whitespace-nowrap bg-[#fbf3df]" title="ยังไม่ได้เชื่อม Supabase — ข้อมูลอยู่ในเบราว์เซอร์นี้เท่านั้น">โหมดทดสอบ</span>
          <span class="hidden text-muted xl:inline">{{ auth.user?.email }}</span>
          <a :href="base" class="whitespace-nowrap underline" target="_blank" rel="noopener">ดูหน้าเว็บ</a>
          <button class="btn btn-ghost min-h-8 whitespace-nowrap px-3" @click="signOut">ออกจากระบบ</button>
        </div>
      </div>
    </header>
    <RouterView />
    <div v-if="text" class="fixed bottom-4 left-1/2 z-50 max-w-[92vw] -translate-x-1/2 rounded-full px-4 py-2 text-sm text-white shadow-lg" :class="bad ? 'bg-danger' : 'bg-ink'" role="status" aria-live="polite">{{ text }}</div>
  </div>
</template>
