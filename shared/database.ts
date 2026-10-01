import type { Task } from './types.js'

/** SQLite does not bind JavaScript booleans; represent them as INTEGER flags. */
export function taskForDatabase(task: Task): Omit<Task, 'is_completed'> & { is_completed: number } {
  return { ...task, is_completed: task.is_completed ? 1 : 0 }
}

export function taskFromDatabase(task: Omit<Task, 'is_completed'> & { is_completed: number }): Task {
  return { ...task, is_completed: Boolean(task.is_completed) }
}
