import type { Rule } from './types.js'

export function nextRecurringDate(date: string, rule: Rule) {
  const d = new Date(`${date}T12:00:00`)
  if (rule === 'daily') d.setDate(d.getDate() + 1)
  if (rule === 'weekdays') { do d.setDate(d.getDate() + 1); while ([0, 6].includes(d.getDay())) }
  if (rule === 'weekly') d.setDate(d.getDate() + 7)
  if (rule === 'biweekly') d.setDate(d.getDate() + 14)
  if (rule === 'monthly') d.setMonth(d.getMonth() + 1)
  if (rule === 'yearly') d.setFullYear(d.getFullYear() + 1)
  return d.toLocaleDateString('en-CA')
}
