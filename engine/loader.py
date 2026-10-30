from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path
from typing import Any

from engine.models import Manifest, ModuleMeta, ModuleRecord


MODULES_DIR = Path(__file__).parent.parent / "modules"
MODULES_DIR.mkdir(exist_ok=True)

_FORBIDDEN_SQL = re.compile(
    r"\b(CREATE|INSERT|UPDATE|DELETE|DROP|ALTER|ATTACH|DETACH|PRAGMA|VACUUM|REINDEX|ANALYZE)\b",
    re.IGNORECASE,
)


def _validate_schema_sql(sql: str) -> None:
    """Basic safety check - allow CREATE TABLE/INDEX/VIEW and INSERT for seed data."""
    # Remove comments first
    sql_no_comments = re.sub(r'--.*$', '', sql, flags=re.MULTILINE)
    statements = [s.strip() for s in sql_no_comments.split(";") if s.strip()]
    for stmt in statements:
        upper = stmt.upper()
        if upper.startswith(("CREATE TABLE", "CREATE INDEX", "CREATE VIEW", "INSERT")):
            continue
        if _FORBIDDEN_SQL.search(stmt):
            raise ValueError(f"Forbidden SQL statement: {stmt[:80]}...")
    # Validate syntax with SQLite
    conn = sqlite3.connect(":memory:")
    try:
        conn.executescript(sql)
    except sqlite3.Error as e:
        raise ValueError(f"Invalid schema SQL: {e}")
    finally:
        conn.close()


def load_manifest(module_dir: Path) -> Manifest:
    manifest_path = module_dir / "manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"manifest.json not found in {module_dir}")
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    return Manifest(**data)


def load_schema(module_dir: Path) -> str:
    schema_path = module_dir / "schema.sql"
    if not schema_path.exists():
        raise FileNotFoundError(f"schema.sql not found in {module_dir}")
    sql = schema_path.read_text(encoding="utf-8")
    _validate_schema_sql(sql)
    return sql


def load_fragments(module_dir: Path, manifest: Manifest) -> dict[str, str]:
    story_dir = module_dir / "story"
    if not story_dir.exists():
        raise FileNotFoundError(f"story/ directory not found in {module_dir}")

    fragments = {}
    for frag_id in manifest.fragments:
        frag_path = story_dir / f"{frag_id}.md"
        if not frag_path.exists():
            raise FileNotFoundError(f"Fragment {frag_id}.md not found in {story_dir}")
        fragments[frag_id] = frag_path.read_text(encoding="utf-8")
    return fragments


def load_solution(module_dir: Path) -> str:
    solution_path = module_dir / "solution.md"
    if not solution_path.exists():
        raise FileNotFoundError(f"solution.md not found in {module_dir}")
    return solution_path.read_text(encoding="utf-8")


def init_module_db(module_dir: Path, schema_sql: str) -> Path:
    """Create SQLite DB file for module from schema.sql."""
    db_path = module_dir / "module.db"
    # Remove existing DB to avoid conflicts
    if db_path.exists():
        db_path.unlink()
    conn = sqlite3.connect(db_path)
    try:
        conn.executescript(schema_sql)
        conn.commit()
    finally:
        conn.close()
    return db_path


def load_module(module_id: str) -> ModuleRecord:
    module_dir = MODULES_DIR / module_id
    if not module_dir.exists():
        raise FileNotFoundError(f"Module {module_id} not found at {module_dir}")

    manifest = load_manifest(module_dir)
    schema_sql = load_schema(module_dir)
    fragments = load_fragments(module_dir, manifest)
    solution_md = load_solution(module_dir)
    db_path = init_module_db(module_dir, schema_sql)

    return ModuleRecord(
        manifest=manifest,
        schema_sql=schema_sql,
        fragments=fragments,
        solution_md=solution_md,
        db_path=db_path,
    )


def list_modules() -> list[ModuleMeta]:
    modules = []
    for module_dir in MODULES_DIR.iterdir():
        if not module_dir.is_dir():
            continue
        try:
            manifest = load_manifest(module_dir)
            modules.append(ModuleMeta(
                id=manifest.id,
                title=manifest.title,
                description=manifest.description,
                author=manifest.author,
                difficulty=manifest.difficulty,
                estimated_time_min=manifest.estimated_time_min,
                start_fragment=manifest.start_fragment,
                fragments=manifest.fragments,
            ))
        except Exception:
            continue  # Skip invalid modules
    return sorted(modules, key=lambda m: m.id)


def get_schema_info(module_id: str) -> dict[str, list[str]]:
    """Return {table: [columns]} for autocomplete."""
    module = load_module(module_id)
    conn = sqlite3.connect(module.db_path)
    try:
        cursor = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
        tables = [row[0] for row in cursor.fetchall()]
        schema = {}
        for table in tables:
            cursor = conn.execute(f"PRAGMA table_info({table})")
            schema[table] = [row[1] for row in cursor.fetchall()]
        return schema
    finally:
        conn.close()