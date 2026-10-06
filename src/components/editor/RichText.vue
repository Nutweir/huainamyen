<script setup lang="ts">
/*
 * Small rich-text field (Tiptap): bold, italic, link and line breaks only. Enter = new line inside
 * the block; the value is stored as plain sanitized inline HTML ("<b>…</b><br>…"), not editor JSON,
 * so content never depends on Tiptap.
 */
import { onBeforeUnmount, watch } from "vue";
import { EditorContent, useEditor } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { Extension } from "@tiptap/core";
import { sanitizeInline } from "@/utils/sanitize";

const props = defineProps<{ modelValue: string; placeholder?: string; display?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [string] }>();

const EnterIsBreak = Extension.create({
  name: "enterIsBreak",
  addKeyboardShortcuts() { return { Enter: () => this.editor.commands.setHardBreak() }; },
});

/** "<p>a<br>b</p><p>c</p>" → "a<br>b<br>c", sanitized */
const toInline = (html: string) => sanitizeInline(html.replace(/<\/p>\s*<p>/g, "<br>").replace(/^<p>|<\/p>$/g, "").replace(/<p><\/p>/g, ""));

const editor = useEditor({
  content: props.modelValue ? `<p>${sanitizeInline(props.modelValue)}</p>` : "",
  extensions: [
    StarterKit.configure({ heading: false, bulletList: false, orderedList: false, listItem: false, blockquote: false, codeBlock: false, code: false, horizontalRule: false, strike: false }),
    Link.configure({ openOnClick: false, autolink: true, protocols: ["http", "https", "mailto", "tel"] }),
    EnterIsBreak,
  ],
  editorProps: { attributes: { class: `rich ${props.display ? "font-display text-lg" : ""}`, "aria-label": props.placeholder || "ข้อความ", "data-placeholder": props.placeholder || "" } },
  onUpdate: ({ editor: e }) => emit("update:modelValue", e.isEmpty ? "" : toInline(e.getHTML())),
});

watch(() => props.modelValue, v => {
  const e = editor.value;
  if (e && toInline(e.getHTML()) !== v && !e.isFocused) e.commands.setContent(v ? `<p>${sanitizeInline(v)}</p>` : "", false);
});
onBeforeUnmount(() => editor.value?.destroy());

function setLink() {
  const e = editor.value;
  if (!e) return;
  const prev = e.getAttributes("link").href as string | undefined;
  const href = window.prompt("ลิงก์ (https://…)", prev || "https://");
  if (href === null) return;
  if (!href || href === "https://") e.chain().focus().unsetLink().run();
  else e.chain().focus().extendMarkRange("link").setLink({ href }).run();
}
</script>

<template>
  <div class="rounded-lg border border-rule bg-white focus-within:border-forest">
    <div class="flex gap-1 border-b border-[#efe9dd] px-2 py-1 text-sm" role="toolbar" aria-label="จัดรูปแบบข้อความ">
      <button type="button" class="min-w-8 rounded px-2 font-bold" :class="{ 'bg-[#eee8dc]': editor?.isActive('bold') }" title="ตัวหนา (Ctrl+B)" @click="editor?.chain().focus().toggleBold().run()">B</button>
      <button type="button" class="min-w-8 rounded px-2 italic" :class="{ 'bg-[#eee8dc]': editor?.isActive('italic') }" title="ตัวเอียง (Ctrl+I)" @click="editor?.chain().focus().toggleItalic().run()">I</button>
      <button type="button" class="rounded px-2" :class="{ 'bg-[#eee8dc]': editor?.isActive('link') }" title="ลิงก์" @click="setLink">ลิงก์</button>
      <span class="ml-auto self-center text-xs text-muted">Enter = ขึ้นบรรทัดใหม่</span>
    </div>
    <EditorContent :editor="editor" class="px-3 py-2" />
  </div>
</template>

<style>
.rich p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: #a39b8c; float: left; height: 0; pointer-events: none; }
.rich a { color: var(--color-forest); text-decoration: underline; }
</style>
