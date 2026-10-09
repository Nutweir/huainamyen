import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import PublicLayout from "@/layouts/PublicLayout.vue";
import { useAuthStore } from "@/stores/auth";

/** The old site's front page was this journal; its #anchors still land there. */
export const LEGACY_HOME_SLUG = "huai-nam-yen";

const routes: RouteRecordRaw[] = [
  {
    path: "/",
    component: PublicLayout,
    children: [
      { path: "", name: "home", component: () => import("@/pages/Home.vue") },
      { path: "journeys", name: "journeys", component: () => import("@/pages/Journeys.vue") },
      { path: "journeys/:slug", name: "trip", component: () => import("@/pages/TripDetail.vue") },
      { path: "about", name: "about", component: () => import("@/pages/About.vue") },
    ],
  },
  { path: "/admin/login", name: "login", component: () => import("@/pages/admin/Login.vue") },
  {
    path: "/admin",
    component: () => import("@/layouts/AdminLayout.vue"),
    meta: { requiresEditor: true },
    children: [
      { path: "", name: "dashboard", component: () => import("@/pages/admin/AdminDashboard.vue") },
      { path: "trips", name: "trips", component: () => import("@/pages/admin/TripList.vue") },
      { path: "trips/:id", name: "trip-editor", component: () => import("@/pages/admin/TripEditor.vue") },
      { path: "media", name: "media", component: () => import("@/pages/admin/MediaLibrary.vue") },
      { path: "about", name: "about-editor", component: () => import("@/pages/admin/AboutEditor.vue") },
      { path: "settings", name: "settings", component: () => import("@/pages/admin/SiteSettings.vue") },
    ],
  },
  { path: "/admin/trips/:id/preview", name: "preview", component: () => import("@/pages/admin/TripPreview.vue"), meta: { requiresEditor: true } },
  // old static-site addresses
  { path: "/index.html", redirect: to => ({ path: "/", query: to.query, hash: to.hash }) },
  { path: "/journeys.html", redirect: "/journeys" },
  { path: "/admin.html", redirect: "/admin" },
  { path: "/:pathMatch(.*)*", name: "not-found", component: () => import("@/pages/NotFound.vue") },
];

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(to, _from, saved) {
    if (saved) return saved;
    if (to.hash) return false; // the journal scrolls itself once its content is on the page
    return { top: 0 };
  },
});

router.beforeEach(async to => {
  // "/#day-02", "/?trip=huai-nam-yen", "/?slots#waterfall" … → the journal those links meant
  if (to.name === "home" && (to.hash || to.query.trip || to.query.slots !== undefined)) {
    const slug = (to.query.trip as string) || LEGACY_HOME_SLUG;
    const query = to.query.slots !== undefined ? { slots: "" } : {};
    return { path: `/journeys/${slug}`, hash: to.hash, query, replace: true };
  }
  if (to.matched.some(r => r.meta.requiresEditor)) {
    const auth = useAuthStore();
    await auth.ready;
    if (!auth.user) return { name: "login", query: { next: to.fullPath } };
    if (!auth.isEditor) return { name: "login", query: { next: to.fullPath, denied: "1" } };
  }
  return true;
});

// Admin screens name the tab themselves (public pages set title + description via usePageMeta)
const ADMIN_TITLES: Record<string, string> = {
  login: "เข้าสู่ระบบ", dashboard: "ภาพรวม", trips: "ทริป", "trip-editor": "แก้ไขทริป",
  media: "คลังรูปและวิดีโอ", settings: "ตั้งค่า", preview: "ตัวอย่าง", "about-editor": "เกี่ยวกับผู้เขียน",
};
router.afterEach(to => {
  const name = String(to.name || "");
  if (ADMIN_TITLES[name]) document.title = `${ADMIN_TITLES[name]} · หลังบ้าน · Journeys by Nutweir`;
});
