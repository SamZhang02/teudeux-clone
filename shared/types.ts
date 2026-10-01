export type Rule = 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly' | 'yearly' | null
export interface Task { id: string; text: string; is_completed: boolean; date: string | null; list_id: string | null; sort_order: number; recurring_rule: Rule; recurring_task_id?: string; created_at?: string }
export interface List { id: string; title: string; sort_order: number }
export interface RecurringTask { id: string; text: string; start_date: string; recurring_rule: Exclude<Rule, null>; sort_order: number }
export interface RecurringCompletion { recurring_task_id: string; date: string }
