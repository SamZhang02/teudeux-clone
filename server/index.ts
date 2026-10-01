import express from 'express'
import cors from 'cors'
import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RecurringTask, Task } from '../shared/types.js'
import { taskForDatabase, taskFromDatabase } from '../shared/database.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const db = new Database(path.join(__dirname, '../teudeux.db'))
db.pragma('journal_mode = WAL')
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, text TEXT NOT NULL, is_completed INTEGER DEFAULT 0, date TEXT,
  list_id TEXT, sort_order INTEGER NOT NULL DEFAULT 0, recurring_rule TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
); CREATE TABLE IF NOT EXISTS custom_lists (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0
); CREATE TABLE IF NOT EXISTS recurring_tasks (
  id TEXT PRIMARY KEY, text TEXT NOT NULL, start_date TEXT NOT NULL,
  end_date TEXT, recurring_rule TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0
); CREATE TABLE IF NOT EXISTS recurring_completions (
  recurring_task_id TEXT NOT NULL, date TEXT NOT NULL, completed_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (recurring_task_id, date),
  FOREIGN KEY(recurring_task_id) REFERENCES recurring_tasks(id) ON DELETE CASCADE
);`)
if (!(db.prepare("PRAGMA table_info(recurring_tasks)").all() as Array<{ name: string }>).some(column => column.name === 'end_date')) db.exec('ALTER TABLE recurring_tasks ADD COLUMN end_date TEXT')

const today = () => new Date().toLocaleDateString('en-CA')
function rollover() { db.prepare('UPDATE tasks SET date = ? WHERE is_completed = 0 AND date IS NOT NULL AND date < ?').run(today(), today()) }
function migrateLegacyRecurringTasks() {
  const legacy = db.prepare('SELECT * FROM tasks WHERE recurring_rule IS NOT NULL').all() as Task[]
  const groups = new Map<string, Task[]>()
  legacy.forEach(task => { const key = `${task.text}\u0000${task.recurring_rule}`; groups.set(key, [...(groups.get(key) ?? []), task]) })
  const migrate = db.transaction(() => groups.forEach(group => {
    const dated = group.filter(task => task.date).sort((a,b) => a.date!.localeCompare(b.date!))
    const template = dated[0]
    if (!template?.date || !template.recurring_rule) return
    db.prepare('INSERT OR IGNORE INTO recurring_tasks (id,text,start_date,recurring_rule,sort_order) VALUES (?,?,?,?,?)').run(template.id, template.text, template.date, template.recurring_rule, template.sort_order)
    group.filter(task => task.is_completed && task.date).forEach(task => db.prepare('INSERT OR IGNORE INTO recurring_completions (recurring_task_id,date) VALUES (?,?)').run(template.id, task.date))
    group.forEach(task => db.prepare('DELETE FROM tasks WHERE id = ?').run(task.id))
  }))
  migrate()
}
function seed() {
  if ((db.prepare('SELECT COUNT(*) as count FROM custom_lists').get() as { count: number }).count) return
  const insert = db.prepare('INSERT INTO custom_lists (id,title,sort_order) VALUES (?,?,?)')
  ;[['groceries', 'GROCERIES', 0], ['someday', 'SOMEDAY', 1], ['ideas', 'IDEAS', 2]].forEach(([id, title, order]) => insert.run(id, title, order))
  const task = db.prepare('INSERT INTO tasks (id,text,date,list_id,sort_order,recurring_rule) VALUES (?,?,?,?,?,?)')
  task.run(randomUUID(), 'Welcome to your week ✦', today(), null, 0, null)
  task.run(randomUUID(), 'Drag tasks wherever they belong', today(), null, 1, null)
  task.run(randomUUID(), 'Oat milk', null, 'groceries', 0, null)
  task.run(randomUUID(), 'Plan a little adventure', null, 'someday', 0, null)
}
seed()
migrateLegacyRecurringTasks()
const app = express(); app.use(cors()); app.use(express.json())
app.get('/api/bootstrap', (_req, res) => {
  rollover()
  const tasks = (db.prepare('SELECT * FROM tasks ORDER BY sort_order').all() as Array<Omit<Task, 'is_completed'> & { is_completed: number }>).map(taskFromDatabase)
  res.json({ tasks, lists: db.prepare('SELECT * FROM custom_lists ORDER BY sort_order').all(), recurringTasks: db.prepare('SELECT * FROM recurring_tasks ORDER BY sort_order').all(), recurringCompletions: db.prepare('SELECT recurring_task_id,date FROM recurring_completions').all() })
})
app.post('/api/tasks', (req, res) => {
  const task: Task = { id: randomUUID(), text: req.body.text ?? '', date: req.body.date ?? null, list_id: req.body.list_id ?? null, sort_order: req.body.sort_order ?? 0, is_completed: false, recurring_rule: req.body.recurring_rule ?? null }
  db.prepare('INSERT INTO tasks (id,text,is_completed,date,list_id,sort_order,recurring_rule) VALUES (@id,@text,@is_completed,@date,@list_id,@sort_order,@recurring_rule)').run(taskForDatabase(task))
  res.status(201).json(task)
})
app.patch('/api/tasks/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id) as Task | undefined
  const existing = row && { ...row, is_completed: Boolean(row.is_completed) }
  if (!existing) return res.sendStatus(404)
  const updated = { ...existing, ...req.body }
  if (updated.recurring_rule && updated.date) {
    const convert = db.transaction(() => {
      db.prepare('INSERT INTO recurring_tasks (id,text,start_date,recurring_rule,sort_order) VALUES (?,?,?,?,?)').run(existing.id, updated.text, updated.date, updated.recurring_rule, updated.sort_order)
      if (updated.is_completed) db.prepare('INSERT OR IGNORE INTO recurring_completions (recurring_task_id,date) VALUES (?,?)').run(existing.id, updated.date)
      db.prepare('DELETE FROM tasks WHERE id=?').run(existing.id)
    })
    convert()
    return res.json(updated)
  }
  db.prepare('UPDATE tasks SET text=@text,is_completed=@is_completed,date=@date,list_id=@list_id,sort_order=@sort_order,recurring_rule=@recurring_rule WHERE id=@id').run(taskForDatabase(updated))
  res.json(updated)
})
app.patch('/api/recurring/:id', (req,res) => {
  const existing = db.prepare('SELECT * FROM recurring_tasks WHERE id=?').get(req.params.id) as RecurringTask | undefined
  if (!existing) return res.sendStatus(404)
  const text = req.body.text ?? existing.text
  const recurringRule = req.body.recurring_rule ?? existing.recurring_rule
  db.prepare('UPDATE recurring_tasks SET text=?, recurring_rule=? WHERE id=?').run(text, recurringRule, req.params.id)
  res.sendStatus(204)
})
app.post('/api/recurring/:id/disable', (req,res) => {
  const template = db.prepare('SELECT * FROM recurring_tasks WHERE id=?').get(req.params.id) as RecurringTask | undefined
  const { date, is_completed, text } = req.body as { date?: string; is_completed?: boolean; text?: string }
  if (!template || !date) return res.sendStatus(404)
  const disable = db.transaction(() => {
    db.prepare('UPDATE recurring_tasks SET end_date=? WHERE id=?').run(date, template.id)
    db.prepare('DELETE FROM recurring_completions WHERE recurring_task_id=? AND date>=?').run(template.id, date)
    db.prepare('INSERT INTO tasks (id,text,is_completed,date,list_id,sort_order,recurring_rule) VALUES (?,?,?,?,?,?,NULL)').run(randomUUID(), text ?? template.text, is_completed ? 1 : 0, date, null, template.sort_order)
  })
  disable()
  res.sendStatus(204)
})
app.post('/api/recurring/:id/completions', (req,res) => { const { date, is_completed } = req.body; if (is_completed) db.prepare('INSERT OR IGNORE INTO recurring_completions (recurring_task_id,date) VALUES (?,?)').run(req.params.id, date); else db.prepare('DELETE FROM recurring_completions WHERE recurring_task_id=? AND date=?').run(req.params.id, date); res.sendStatus(204) })
app.delete('/api/tasks/:id', (req,res) => { db.prepare('DELETE FROM tasks WHERE id=?').run(req.params.id); res.sendStatus(204) })
app.put('/api/tasks/reorder', (req,res) => { const update = db.prepare('UPDATE tasks SET sort_order=@sort_order,date=@date,list_id=@list_id WHERE id=@id'); const tx = db.transaction((items: Task[]) => items.forEach(item => update.run(item))); tx(req.body); res.sendStatus(204) })
app.post('/api/lists', (req,res) => { const list={id:randomUUID(),title:req.body.title || 'NEW LIST',sort_order:req.body.sort_order || 0}; db.prepare('INSERT INTO custom_lists (id,title,sort_order) VALUES (@id,@title,@sort_order)').run(list); res.status(201).json(list) })
app.patch('/api/lists/:id', (req,res) => { db.prepare('UPDATE custom_lists SET title=? WHERE id=?').run(req.body.title,req.params.id); res.json({id:req.params.id,title:req.body.title}) })
app.delete('/api/lists/:id', (req,res) => {
  const remove = db.transaction((id: string) => { db.prepare('DELETE FROM tasks WHERE list_id = ?').run(id); db.prepare('DELETE FROM custom_lists WHERE id = ?').run(id) })
  remove(req.params.id)
  res.sendStatus(204)
})
app.listen(3001, () => console.log('TeuxDeux API on http://localhost:3001'))
