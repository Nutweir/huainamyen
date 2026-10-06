import { onBeforeUnmount, onMounted } from "vue";

/** Admin screens drop the diary look (body.diary: moods, grain, paper) while they are open. */
export function useAdminBody(): void {
  onMounted(() => { document.body.classList.remove("diary"); delete document.body.dataset.mood; document.body.classList.add("admin-app"); });
  onBeforeUnmount(() => { document.body.classList.remove("admin-app"); });
}
