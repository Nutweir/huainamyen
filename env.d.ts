/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_BASE?: string;
  readonly VITE_BACKEND?: "supabase" | "local";
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SITE_URL?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv }
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
