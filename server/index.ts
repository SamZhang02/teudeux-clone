import express from 'express'
import cors from 'cors'
import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Task } from '../shared/types.js'
import { nextRecurringDate } from '../shared/scheduling.js'
import { taskForDatabase, taskFromDatabase } from '../shared/database.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const db = new Database(path.join(__dirname, '../teudeux.db'))
db.pragma('journal_mode = WAL')
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, text TEXT NOT NULL, is_completed INTEGER DEFAULT 0, date TEXT,
  list_id TEXT, sort_order INTEGER NOT NULL DEFAULT 0, recurring_rule TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
); CREATE TABLE IF NOT EXISTS custom_lists (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0
);`)

const today = () => new Date().toLocaleDateString('en-CA')
function rollover() { db.prepare('UPDATE tasks SET date = ? WHERE is_completed = 0 AND date IS NOT NULL AND date < ?').run(today(), today()) }
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
const app = express(); app.use(cors()); app.use(express.json())
app.get('/api/bootstrap', (_req, res) => {
  rollover()
  const tasks = (db.prepare('SELECT * FROM tasks ORDER BY sort_order').all() as Array<Omit<Task, 'is_completed'> & { is_completed: number }>).map(taskFromDatabase)
  res.json({ tasks, lists: db.prepare('SELECT * FROM custom_lists ORDER BY sort_order').all() })
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
  db.prepare('UPDATE tasks SET text=@text,is_completed=@is_completed,date=@date,list_id=@list_id,sort_order=@sort_order,recurring_rule=@recurring_rule WHERE id=@id').run(taskForDatabase(updated))
  if (!existing.is_completed && updated.is_completed && existing.recurring_rule && existing.date) {
    const newTask = { ...existing, id: randomUUID(), date: nextRecurringDate(existing.date, existing.recurring_rule), is_completed: false }
    db.prepare('INSERT INTO tasks (id,text,is_completed,date,list_id,sort_order,recurring_rule) VALUES (@id,@text,@is_completed,@date,@list_id,@sort_order,@recurring_rule)').run(taskForDatabase(newTask))
  }
  res.json(updated)
})
app.delete('/api/tasks/:id', (req,res) => { db.prepare('DELETE FROM tasks WHERE id=?').run(req.params.id); res.sendStatus(204) })
app.put('/api/tasks/reorder', (req,res) => { const update = db.prepare('UPDATE tasks SET sort_order=@sort_order,date=@date,list_id=@list_id WHERE id=@id'); const tx = db.transaction((items: Task[]) => items.forEach(item => update.run(item))); tx(req.body); res.sendStatus(204) })
app.post('/api/lists', (req,res) => { const list={id:randomUUID(),title:req.body.title || 'NEW LIST',sort_order:req.body.sort_order || 0}; db.prepare('INSERT INTO custom_lists (id,title,sort_order) VALUES (@id,@title,@sort_order)').run(list); res.status(201).json(list) })
app.patch('/api/lists/:id', (req,res) => { db.prepare('UPDATE custom_lists SET title=? WHERE id=?').run(req.body.title,req.params.id); res.json({id:req.params.id,title:req.body.title}) })
app.listen(3001, () => console.log('TeuxDeux API on http://localhost:3001'))
