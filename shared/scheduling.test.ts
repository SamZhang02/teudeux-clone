import { describe, expect, it } from 'vitest'
import { nextRecurringDate } from './scheduling.js'

describe('recurring task schedule', () => {
  it('calculates daily, weekly and monthly follow-ups', () => {
    expect(nextRecurringDate('2026-10-01', 'daily')).toBe('2026-10-02')
    expect(nextRecurringDate('2026-10-01', 'weekly')).toBe('2026-10-08')
    expect(nextRecurringDate('2026-10-01', 'monthly')).toBe('2026-11-01')
  })
  it('skips a weekend for a weekday task', () => expect(nextRecurringDate('2026-10-02', 'weekdays')).toBe('2026-10-05'))
})
