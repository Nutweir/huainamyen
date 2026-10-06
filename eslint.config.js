import pluginVue from "eslint-plugin-vue";
import { defineConfigWithVueTs, vueTsConfigs } from "@vue/eslint-config-typescript";
import globals from "globals";

export default defineConfigWithVueTs(
  { ignores: ["dist/**", "legacy/**", "public/**", "node_modules/**", "playwright-report/**", "test-results/**", ".tmp/**"] },
  pluginVue.configs["flat/recommended"],
  vueTsConfigs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      "vue/multi-word-component-names": "off",
      "vue/max-attributes-per-line": "off",
      "vue/singleline-html-element-content-newline": "off",
      "vue/html-self-closing": "off",
      "vue/no-v-html": "off", // every v-html in this app goes through utils/sanitize
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
);
