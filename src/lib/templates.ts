import type { Template } from '../types'

const h = (level: number, text: string) => ({ type: 'heading', props: { level }, content: text })
const p = (text = '') => ({ type: 'paragraph', content: text })
const todo = (text: string) => ({ type: 'checkListItem', props: { checked: false }, content: text })
const bullet = (text: string) => ({ type: 'bulletListItem', content: text })

export const BUILTIN_TEMPLATES: Template[] = [
  { id: 'tpl-daily', builtin: true, emoji: '☀️', name: 'Daily note', title: '', content: [h(3, 'Focus'), todo(''), todo(''), todo(''), h(3, 'Notes'), p()] },
  { id: 'tpl-meeting', builtin: true, emoji: '🗓️', name: 'Meeting notes', title: 'Meeting — ', content: [p('Date · Attendees'), h(3, 'Agenda'), bullet(''), h(3, 'Discussion'), p(), h(3, 'Decisions'), bullet(''), h(3, 'Action items'), todo('')] },
  { id: 'tpl-project', builtin: true, emoji: '🧭', name: 'Project brief', title: 'Project: ', content: [h(3, 'Goal'), p(), h(3, 'Scope'), bullet('In: '), bullet('Out: '), h(3, 'Milestones'), todo(''), h(3, 'Risks'), bullet(''), h(3, 'Links'), p()] },
  { id: 'tpl-bug', builtin: true, emoji: '🐞', name: 'Bug report', title: 'Bug: ', content: [h(3, 'What happened'), p(), h(3, 'Steps to reproduce'), { type: 'numberedListItem', content: '' }, h(3, 'Expected'), p(), h(3, 'Fix checklist'), todo('Reproduce'), todo('Fix'), todo('Verify')] },
  { id: 'tpl-idea', builtin: true, emoji: '💡', name: 'Idea', title: '', content: [h(3, 'The idea'), p(), h(3, 'Why it matters'), p(), h(3, 'Next step'), todo('')] },
  { id: 'tpl-checklist', builtin: true, emoji: '✅', name: 'Checklist', title: '', content: [todo(''), todo(''), todo('')] },
]

export const todayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const dailyTitle = (d = new Date()) => d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
