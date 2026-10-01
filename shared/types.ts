export type Rule = 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly' | 'yearly' | null
export interface Task { id: string; text: string; is_completed: boolean; date: string | null; list_id: string | null; sort_order: number; recurring_rule: Rule; created_at?: string }
export interface List { id: string; title: string; sort_order: number }
