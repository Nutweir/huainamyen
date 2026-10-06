import { ref } from "vue";

/** One short message at the bottom of the admin ("บันทึกแล้ว", errors). */
const text = ref("");
const bad = ref(false);
let timer = 0;
export function useToast() {
  function toast(msg: string, isError = false, ms = isError ? 7000 : 3000) {
    text.value = msg; bad.value = isError;
    clearTimeout(timer);
    timer = window.setTimeout(() => { text.value = ""; }, ms);
  }
  return { text, bad, toast };
}
