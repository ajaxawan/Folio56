import { codeBlockOptions, syntaxHighlighter } from '@blocknote/code-block'
import { BlockNoteSchema, createCodeBlockSpec } from '@blocknote/core'

// Code blocks with a language picker + Shiki syntax colouring (bundled grammars, works offline).
export const schema = BlockNoteSchema.create().extend({
  blockSpecs: { codeBlock: createCodeBlockSpec({ ...codeBlockOptions, defaultLanguage: 'text' }) },
})
export const editorExtensions = [syntaxHighlighter]

// Map aliases ("bash", "py", "ts", "sh"…) to the canonical language keys the highlighter knows.
const langs = codeBlockOptions.supportedLanguages as Record<string, { name: string; aliases?: string[] }>
const alias = new Map<string, string>()
for (const [key, v] of Object.entries(langs)) {
  alias.set(key.toLowerCase(), key)
  alias.set(v.name.toLowerCase(), key)
  for (const a of v.aliases ?? []) alias.set(a.toLowerCase(), key)
}
Object.entries({ sh: 'shellscript', bash: 'shellscript', zsh: 'shellscript', shell: 'shellscript', console: 'shellscript', py: 'python', js: 'javascript', ts: 'typescript', yml: 'yaml', md: 'markdown', 'c#': 'csharp', cs: 'csharp', plaintext: 'text', txt: 'text', '': 'text' })
  .forEach(([a, k]) => { if (!alias.has(a) && k in langs) alias.set(a, k) })
export const canonicalLanguage = (l?: string) => alias.get((l ?? '').toLowerCase().trim()) ?? 'text'

/** Returns a copy of the document with every code block's language made highlighter-safe. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeCode(blocks: any[]): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (blocks ?? []).map((b: any) => {
    let nb = b
    if (b?.type === 'codeBlock') { const lang = canonicalLanguage(b.props?.language); if (lang !== b.props?.language) nb = { ...b, props: { ...b.props, language: lang } } }
    if (b?.children?.length) nb = { ...nb, children: normalizeCode(b.children) }
    return nb
  })
}
