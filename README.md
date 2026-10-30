# SQL Game Engine v1.0.0

A modular SQL mystery game for teaching database querying through interactive storytelling.

> **Note:** This project was created with the assistance of AI (Hermes Agent by Nous Research). The codebase, architecture, and documentation were generated through iterative human-AI collaboration.

## Quick Start

```bash
# Install dependencies
pip install -e ".[dev]"

# Run server
python -m engine.main

# Or with uvicorn directly
uvicorn engine.main:app --reload --port 8000
```

Open http://localhost:8000 in your browser.

## Project Structure

```
SQL-Game/
├── pyproject.toml
├── DESIGN.md              # This design document
├── README.md
├── engine/
│   ├── __init__.py
│   ├── main.py            # FastAPI app
│   ├── models.py          # Pydantic models
│   ├── loader.py          # Module discovery & validation
│   ├── session.py         # Session management
│   └── executor.py        # Query execution & validation
├── frontend/
│   ├── index.html
│   ├── style.css
│   ├── app.js             # Main application logic
│   └── editor.js          # Monaco Editor setup
└── modules/
    └── fall_01/           # Demo module: "Der verschwundene Schlüssel"
        ├── manifest.json  # Module metadata + unlock graph
        ├── schema.sql     # SQLite schema + seed data
        ├── story/
        │   ├── 01_intro.md
        │   ├── 02_witness.md
        │   ├── 03_fingerprint.md
        │   ├── 04_motive.md
        │   └── 05_solution.md
        └── solution.md    # Full reveal on solve
```

## Creating New Modules

1. Create directory under `modules/<module_id>/`
2. Add `manifest.json` (see demo for format)
3. Add `schema.sql` with CREATE TABLE + seed data
4. Add story fragments in `story/` as markdown files
5. Add `solution.md` for the final reveal
6. Restart server — module auto-loads

## Module Manifest Format

```json
{
  "id": "unique_id",
  "title": "Display Title",
  "description": "Short description",
  "author": "Author Name",
  "difficulty": 1-5,
  "estimated_time_min": 30,
  "start_fragment": "01_intro",
  "fragments": {
    "01_intro": { "unlocked_by": null, "title": "Einleitung" },
    "02_clue": { "unlocked_by": "q_first_query", "title": "Erster Hinweis" }
  },
  "queries": {
    "q_first_query": {
      "description": "What this query should find",
      "validation": { "type": "pattern", "pattern": "SELECT * FROM table WHERE ..." },
      "hint": "Helpful hint for students"
    }
  },
  "success_condition": "all_fragments_unlocked"
}
```

### Validation Types

| Type | Use Case |
|------|----------|
| `pattern` | Regex match on normalized SQL (flexible) |
| `exact_columns` | Result must contain specific columns |
| `row_count` | Result must return exact row count |
| `custom` | Python callable for complex logic |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/modules` | List all modules |
| GET | `/api/modules/{id}` | Module metadata |
| GET | `/api/modules/{id}/schema` | Table/column info for autocomplete |
| POST | `/api/modules/{id}/session` | Create new session |
| POST | `/api/modules/{id}/query` | Execute SQL query |
| GET | `/api/modules/{id}/fragment/{fid}` | Get fragment content |
| POST | `/api/modules/{id}/solve` | Check solution |

## Safety

- SQLite authorizer blocks all non-SELECT statements
- Query instruction limit: 100,000 (prevents infinite loops)
- Row limit: 100 per query
- Module validation on load (schema syntax, manifest structure)

## Development

```bash
# Run tests
pytest

# Lint
ruff check .

# Format
ruff format .
```

## Tech Stack

- **Backend:** FastAPI, SQLite (stdlib), Pydantic
- **Frontend:** Vanilla JS, Monaco Editor (CDN), no build step
- **Architecture:** Module-based, single-player sessions in memory

## License

MIT