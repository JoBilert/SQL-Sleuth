# SQL Game Engine — Design Document

## 1. Vision

A modular SQL mystery game where players solve cases by querying an embedded database. Each case is a self-contained module: a story, a schema + seed data, and gated info fragments unlocked by correct queries.

**Core loop**: Read story fragment → Formulate SQL → Execute → Unlock next fragment → Repeat until solution.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Web)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Story Panel  │  │  SQL Editor  │  │  Results Table   │  │
│  │ (Markdown)   │  │ (Monaco/ACE) │  │  (Sortable)      │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST / WebSocket
┌──────────────────────────▼──────────────────────────────────┐
│                      Engine Core (Python)                   │
│  ┌─────────────┐  ┌─────────────┐  ┌───────────────────┐   │
│  │ Module      │  │ Session     │  │ Query Validator   │   │
│  │ Loader      │  │ Manager     │  │ & Executor        │   │
│  └─────────────┘  └─────────────┘  └───────────────────┘   │
│         │                │                    │              │
│         ▼                ▼                    ▼              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │            Embedded SQLite (per module)             │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

**Tech stack**:
- Backend: FastAPI + SQLite (stdlib, zero-config)
- Frontend: Single-page vanilla JS or lightweight framework (HTMX/Alpine) — no build step
- Module format: JSON + SQL files in a folder

---

## 3. Module Specification

A module = one directory under `modules/<module_id>/`:

```
modules/
  fall_01/
    manifest.json        # Metadata, unlock graph
    schema.sql           # CREATE TABLE + seed data
    story/
      01_intro.md        # Starting fragment (always visible)
      02_witness.md      # Unlocked by query X
      03_evidence.md     # Unlocked by query Y
      ...
    solution.md          # Final reveal (shown on solve)
```

### manifest.json
```json
{
  "id": "fall_01",
  "title": "Der verschwundene Schlüssel",
  "description": "Ein Kriminalfall im viktorianischen London",
  "author": "Lehrer Name",
  "difficulty": 2,
  "estimated_time_min": 30,
  "start_fragment": "01_intro",
  "fragments": {
    "01_intro": { "unlocked_by": null, "title": "Einleitung" },
    "02_witness": { "unlocked_by": "q_witness", "title": "Zeugenaussage" },
    "03_evidence": { "unlocked_by": "q_evidence", "title": "Beweisstück" }
  },
  "queries": {
    "q_witness": {
      "description": "Finde den Zeugen, der zur Tatzeit in der Nähe war",
      "validation": {
        "type": "pattern",
        "pattern": "SELECT.*FROM.*zeugen.*WHERE.*zeit.*BETWEEN"
      },
      "hint": "Nutze die Tabelle 'zeugen' und filtere nach der Tatzeit"
    },
    "q_evidence": {
      "description": "Finde den Fingerabdruck auf dem Brief",
      "validation": {
        "type": "exact_columns",
        "required": ["person_id", "fingerprint_match"]
      },
      "hint": "Verknüpfe 'beweise' mit 'verdachtige'"
    }
  },
  "success_condition": "all_fragments_unlocked"
}
```

### Validation types
| Type | Purpose |
|------|---------|
| `pattern` | Regex on normalized SQL (case-insensitive, whitespace-collapsed) |
| `exact_columns` | Result must contain these columns |
| `row_count` | Result must return N rows |
| `custom` | Python callable `validate(rows, context) -> bool` |

---

## 4. Engine Core

### Module Loader
- Scans `modules/` on startup
- Validates manifest + schema.sql syntax (EXPLAIN)
- Loads each module into isolated SQLite DB (file or `:memory:`)
- Caches parsed modules

### Session Manager
- One session per player (browser tab)
- Tracks: `unlocked_fragments`, `executed_queries`, `start_time`
- Persists to localStorage (frontend) or server-side (optional)

### Query Executor
```python
def execute_query(module_id: str, session_id: str, sql: str) -> QueryResult:
    # 1. Safety: allow only SELECT, WITH, PRAGMA
    # 2. Run against module's SQLite connection
    # 3. Check validation rules for any matching query key
    # 4. If valid & new unlock → mark fragment unlocked
    # 5. Return { columns, rows, unlocked_fragment?, error? }
```

**Safety**: Block DDL/DML (`CREATE`, `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ATTACH`, `PRAGMA` except safe ones). Use `sqlite3.set_authorizer`.

---

## 5. Frontend

### Layout (responsive, ≥768px side-by-side, mobile stacked)
```
┌────────────────────────────────────────────────────────────┐
│  [Module Title]                          [Progress: 3/7]  │
├──────────────────────┬─────────────────────────────────────┤
│   STORY PANEL        │   SQL EDITOR                        │
│   (scrollable)       │   ┌──────────────────────────────┐  │
│   - Rendered MD      │   │ SELECT * FROM zeugen         │  │
│   - Fragment tabs    │   │ WHERE zeit BETWEEN ...       │  │
│   - Locked = 🔒      │   └──────────────────────────────┘  │
│                      │   [Execute]  [Clear]  [Hint]        │
├──────────────────────┼─────────────────────────────────────┤
│                      │   RESULTS TABLE                     │
│                      │   ┌────┬──────┬───────┐            │
│                      │   │ id │ name │ zeit  │            │
│                      │   │ 3  │ Hans │ 20:15 │            │
│                      │   └────┴──────┴───────┘            │
│                      │   1 row • 12ms                      │
└──────────────────────┴─────────────────────────────────────┘
```

### Key interactions
- **Execute**: POST `/api/modules/{id}/query` → shows results, toasts unlock
- **Hint button**: Shows `queries.<key>.hint` from manifest (once per query)
- **Fragment tabs**: Click to switch; locked tabs show preview tooltip
- **Progress bar**: `unlocked / total` fragments
- **Solve screen**: Modal with `solution.md` + score (time, queries used, hints used)

### Editor
- Monaco Editor (CDN) or CodeMirror 6 — SQL highlighting, autocomplete (table/column names from schema)
- Keyboard: `Ctrl+Enter` = execute

---

## 6. API Contract

```
GET  /api/modules                    → List all modules (id, title, difficulty)
GET  /api/modules/{id}               → Module meta (manifest minus validation rules)
POST /api/modules/{id}/session       → Create session → { session_id }
POST /api/modules/{id}/query         → { session_id, sql } → QueryResult
GET  /api/modules/{id}/fragment/{fid}→ Fragment markdown (403 if locked)
GET  /api/modules/{id}/schema        → Table/column info for autocomplete
POST /api/modules/{id}/solve         → { session_id } → { success, solution_md, stats }
```

---

## 7. Implementation Phases

### Phase 0 — Scaffold (30 min)
- `pyproject.toml` with `fastapi`, `uvicorn`, `sqlite3` (stdlib)
- `frontend/index.html` + `app.js` + `style.css` (no build)
- `modules/` dir with one demo module

### Phase 1 — Engine Core (1–2 h)
- Module loader + manifest validation
- SQLite per module + authorizer
- Session store (in-memory dict → later file/Redis)
- `/query` endpoint with pattern validation

### Phase 2 — Frontend MVP (1–2 h)
- Layout + story panel + editor + results table
- Module list → load module → create session
- Execute query flow + unlock toast
- Fragment tabs + progress

### Phase 3 — Polish (1 h)
- Monaco editor with schema autocomplete
- Hint system
- Solve modal + stats
- Keyboard shortcuts
- Responsive CSS

### Phase 4 — Authoring Tools (optional, later)
- CLI: `python -m engine create-module <id>` → scaffold
- Web: `/author` page to edit fragments + manifest
- Validation: `python -m engine validate modules/fall_01`

---

## 8. Demo Module: "Der verschwundene Schlüssel"

**Schema** (3 tables):
```sql
CREATE TABLE personen (id INTEGER PRIMARY KEY, name TEXT, rolle TEXT);
CREATE TABLE raeume (id INTEGER PRIMARY KEY, name TEXT, beschreibung TEXT);
CREATE TABLE beweise (id INTEGER PRIMARY KEY, person_id INTEGER, raum_id INTEGER, typ TEXT, beschreibung TEXT, zeit TEXT);
```

**Fragments**:
1. Intro (unlocked) — "Lord Blackwell's key vanished at 20:00..."
2. Witness — unlocked by querying `personen` + `beweise` for people near library at 20:00
3. Fingerprint — unlocked by joining `beweise` + `personen` on fingerprint match
4. Motive — unlocked by querying `personen` where `rolle` = 'butler' AND has gambling debt
5. Solution — all fragments unlocked

---

## 9. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| SQL injection | Authorizer blocks everything but SELECT; parameterized queries not needed (read-only) |
| Infinite loops / heavy queries | `sqlite3.set_progress_handler` → abort after N instructions; `LIMIT 100` enforced |
| Students share solutions | Module validation is server-side; manifest not exposed to frontend |
| Browser localStorage cleared | Session ID in URL hash (`#session=abc`) for persistence across reloads |
| Module authoring complexity | Provide template + validation CLI; JSON Schema for manifest |

---

## 10. File Structure (Target)

```
SQL-Game/
├── pyproject.toml
├── engine/
│   ├── __init__.py
│   ├── main.py              # FastAPI app
│   ├── loader.py            # Module discovery + validation
│   ├── session.py           # Session management
│   ├── executor.py          # Query execution + validation
│   └── models.py            # Pydantic models
├── frontend/
│   ├── index.html
│   ├── app.js
│   ├── style.css
│   └── editor.js            # Monaco init + autocomplete
├── modules/
│   └── fall_01/
│       ├── manifest.json
│       ├── schema.sql
│       ├── story/
│       │   ├── 01_intro.md
│       │   ├── 02_witness.md
│       │   ├── 03_fingerprint.md
│       │   ├── 04_motive.md
│       │   └── 05_solution.md
│       └── solution.md
└── tests/
    ├── test_loader.py
    ├── test_executor.py
    └── test_api.py
```

---

## 11. Next Steps

1. **Confirm stack**: FastAPI + vanilla frontend + SQLite OK? (Or prefer Flask/Starlette, React/Svelte, DuckDB?)
2. **Create scaffold** (Phase 0) — I'll generate the starter files
3. **Build demo module** in parallel to validate the design

---

*Skipped: multi-user auth, leaderboards, i18n, Docker, CI — not in scope. Risk: pattern validation is brittle; may need custom validators for complex queries.*