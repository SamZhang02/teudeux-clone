import { describe, expect, it } from 'vitest'
import { taskForDatabase } from './database.js'

describe('SQLite task parameters', () => {
  it('converts completion booleans to SQLite INTEGER flags', () => {
    const base = { id: '1', text: 'Task', date: null, list_id: 'list', sort_order: 0, recurring_rule: null as null }
    expect(taskForDatabase({ ...base, is_completed: false }).is_completed).toBe(0)
    expect(taskForDatabase({ ...base, is_completed: true }).is_completed).toBe(1)
  })
})
