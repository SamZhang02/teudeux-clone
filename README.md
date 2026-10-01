# TeuxDeux clone

A calm, single-user weekly planner inspired by TeuxDeux. It has a seven-day paper planner, persistent custom lists, drag-and-drop scheduling, recurring tasks, rollover of unfinished work, inline Markdown-style emphasis, and a focus view.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5173. The API runs at port 3001 and creates a local `teudeux.db` SQLite database on its first start. Unfinished dated tasks are moved to today when the app is loaded.

## Commands

```bash
npm run dev     # browser app + API
npm run build   # production frontend build and TypeScript check
npm run test    # run unit tests
```

Double-click a task to edit its text or repeat schedule. Use `**bold**` and `_italics_` for light inline formatting.
