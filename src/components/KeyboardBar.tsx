import { Bold, CheckSquare, Mic, ChevronDown, Code, Heading, Image as ImageIcon, IndentDecrease, IndentIncrease, Italic, List, ListOrdered, Plus, Redo2, Undo2 } from 'lucide-react'
import { fileToDataUrl, pickFile } from '../lib/image'
import { putImage } from '../lib/blobs'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Editor = any

/**
 * Formatting row that sits on top of the phone keyboard (iOS has no hover menus and the "/" key
 * is two taps away). Buttons never take focus, so the keyboard and the cursor stay put.
 */
export function KeyboardBar({ editor, locked, onDictate }: { editor: Editor; locked: boolean; onDictate?: () => void }) {
  const cur = () => { try { return editor.getTextCursorPosition().block } catch { return null } }
  const setType = (type: string, props: Record<string, unknown> = {}) => {
    const b = cur(); if (!b) return
    const same = b.type === type && Object.entries(props).every(([k, v]) => b.props?.[k] === v)
    editor.updateBlock(b, same ? { type: 'paragraph' } : { type, props })
  }
  const heading = () => {
    const b = cur(); if (!b) return
    const level = b.type === 'heading' ? b.props.level : 0
    editor.updateBlock(b, level === 0 ? { type: 'heading', props: { level: 2 } } : level === 2 ? { type: 'heading', props: { level: 3 } } : { type: 'paragraph' })
  }
  const insert = () => {
    const menu = editor.getExtension?.('suggestionMenu')
    if (menu?.openSuggestionMenu) menu.openSuggestionMenu('/', { deleteTriggerCharacter: true })
    else editor.insertInlineContent('/')
  }
  const image = async () => {
    const f = await pickFile(); if (!f) return
    const data = await fileToDataUrl(f)
    const url = locked ? data : await putImage(data)
    const b = cur()
    const block = { type: 'image', props: { url, name: f.name } }
    if (b) editor.insertBlocks([block], b, 'after'); else editor.insertBlocks([block], editor.document[editor.document.length - 1], 'after')
  }
  const run = (fn: () => void) => () => { fn(); try { editor.focus() } catch { /* ignore */ } }
  const B = ({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) => (
    <button type="button" aria-label={label} title={label} onMouseDown={(e) => e.preventDefault()} onPointerDown={(e) => e.preventDefault()} onClick={run(onClick)}
      className="flex h-11 min-w-11 shrink-0 items-center justify-center rounded-xl px-2 text-ink-2 active:bg-wash-2 active:text-accent">{children}</button>
  )
  return (
    <div className="kb-bar animate-fade flex items-center border-t border-line bg-pop/95 backdrop-blur-xl" data-testid="keyboard-bar">
      <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1.5 py-1">
        {onDictate && <B label="Dictate" onClick={onDictate}><Mic size={19} className="text-red-400" /></B>}
        <B label="Insert block" onClick={insert}><Plus size={20} /></B>
        <B label="Heading" onClick={heading}><Heading size={19} /></B>
        <B label="Checklist" onClick={() => setType('checkListItem', { checked: false })}><CheckSquare size={19} /></B>
        <B label="Bullet list" onClick={() => setType('bulletListItem')}><List size={20} /></B>
        <B label="Numbered list" onClick={() => setType('numberedListItem')}><ListOrdered size={20} /></B>
        <B label="Bold" onClick={() => editor.toggleStyles({ bold: true })}><Bold size={18} /></B>
        <B label="Italic" onClick={() => editor.toggleStyles({ italic: true })}><Italic size={18} /></B>
        <B label="Code" onClick={() => editor.toggleStyles({ code: true })}><Code size={18} /></B>
        <B label="Indent" onClick={() => editor.canNestBlock() && editor.nestBlock()}><IndentIncrease size={19} /></B>
        <B label="Outdent" onClick={() => editor.canUnnestBlock() && editor.unnestBlock()}><IndentDecrease size={19} /></B>
        <B label="Add image" onClick={image}><ImageIcon size={19} /></B>
        <B label="Undo" onClick={() => editor.undo()}><Undo2 size={19} /></B>
        <B label="Redo" onClick={() => editor.redo()}><Redo2 size={19} /></B>
      </div>
      <button type="button" aria-label="Hide keyboard" onMouseDown={(e) => e.preventDefault()} onClick={() => (document.activeElement as HTMLElement | null)?.blur()}
        className="flex h-11 w-12 shrink-0 items-center justify-center border-l border-line text-accent"><ChevronDown size={22} /></button>
    </div>
  )
}
