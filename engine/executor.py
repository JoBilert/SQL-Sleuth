from __future__ import annotations

import re
import sqlite3
import time
from typing import Any, Callable

from engine.loader import load_module, MODULES_DIR
from engine.models import Manifest, QueryResult, QuerySpec, ValidationType
from engine.session import session_store


_MAX_ROWS = 100
_MAX_INSTRUCTIONS = 100_000


def _authorizer(action: int, arg1: str, arg2: str, dbname: str, source: str) -> int:
    """SQLite authorizer - only allow SELECT, PRAGMA (safe ones)."""
    # SQLITE_SELECT = 21, SQLITE_PRAGMA = 14, SQLITE_READ = 20
    if action == 21:  # SELECT
        return sqlite3.SQLITE_OK
    if action == 20:  # READ (column access during SELECT)
        return sqlite3.SQLITE_OK
    if action == 14:  # PRAGMA
        # Allow only safe pragmas
        if arg1.lower() in ("table_info", "index_list", "index_info"):
            return sqlite3.SQLITE_OK
        return sqlite3.SQLITE_IGNORE
    return sqlite3.SQLITE_DENY


def _normalize_sql(sql: str) -> str:
    """Normalize for pattern matching: collapse whitespace, uppercase keywords."""
    sql = re.sub(r"\s+", " ", sql.strip())
    return sql.upper()


def _validate_pattern(sql: str, pattern: str) -> bool:
    normalized = _normalize_sql(sql)
    pattern_norm = _normalize_sql(pattern)
    # Convert pattern to regex: * -> .*, ? -> .
    regex = re.escape(pattern_norm).replace(r"\*", ".*").replace(r"\?", ".")
    return bool(re.search(regex, normalized))


def _validate_exact_columns(columns: list[str], required: list[str]) -> bool:
    return all(col in columns for col in required)


def _validate_row_count(rows: list[list[Any]], count: int) -> bool:
    return len(rows) == count


def _execute_with_limit(
    conn: sqlite3.Connection,
    sql: str,
    max_rows: int = _MAX_ROWS,
    max_instructions: int = _MAX_INSTRUCTIONS,
) -> tuple[list[str], list[list[Any]]]:
    """Execute query with row and instruction limits."""
    instructions = 0

    def progress_handler() -> int:
        nonlocal instructions
        instructions += 1000
        if instructions > max_instructions:
            return 1  # Abort
        return 0

    conn.set_progress_handler(progress_handler, 1000)
    try:
        cursor = conn.execute(sql)
        columns = [desc[0] for desc in cursor.description] if cursor.description else []
        rows = []
        for i, row in enumerate(cursor):
            if i >= max_rows:
                break
            rows.append(list(row))
        return columns, rows
    finally:
        conn.set_progress_handler(None, 0)


def validate_query(
    manifest: Manifest,
    sql: str,
    columns: list[str],
    rows: list[list[Any]],
) -> str | None:
    """
    Check if query matches any validation rule.
    Returns the query_key that matched, or None.
    """
    for query_key, query_spec in manifest.queries.items():
        val = query_spec.validation
        matched = False

        if val.type == ValidationType.PATTERN:
            matched = _validate_pattern(sql, val.pattern or "")
        elif val.type == ValidationType.EXACT_COLUMNS:
            matched = _validate_exact_columns(columns, val.required or [])
        elif val.type == ValidationType.ROW_COUNT:
            matched = _validate_row_count(rows, val.count or 0)
        elif val.type == ValidationType.CUSTOM:
            # Custom validator: import and call
            if val.function:
                try:
                    module_path, func_name = val.function.rsplit(".", 1)
                    module = __import__(module_path, fromlist=[func_name])
                    func: Callable = getattr(module, func_name)
                    matched = func(rows, {"sql": sql, "columns": columns})
                except Exception:
                    matched = False

        if matched:
            return query_key

    return None


def execute_query(module_id: str, session_id: str, sql: str) -> QueryResult:
    start = time.perf_counter()

    # Load module and session
    module = load_module(module_id)
    session = session_store.get(session_id)
    if not session or session.module_id != module_id:
        return QueryResult(
            columns=[], rows=[], row_count=0, execution_time_ms=0,
            error="Invalid session"
        )

    # Record query attempt
    session_store.record_query(session_id, sql)

    # Execute
    conn = sqlite3.connect(module.db_path)
    conn.set_authorizer(_authorizer)
    try:
        columns, rows = _execute_with_limit(conn, sql)
        row_count = len(rows)
    except sqlite3.Error as e:
        return QueryResult(
            columns=[], rows=[], row_count=0,
            execution_time_ms=(time.perf_counter() - start) * 1000,
            error=str(e)
        )
    finally:
        conn.close()

    execution_ms = (time.perf_counter() - start) * 1000

    # Check validation
    unlocked_fragment = None
    matched_key = validate_query(module.manifest, sql, columns, rows)
    if matched_key:
        query_spec = module.manifest.queries[matched_key]
        fragment_id = None
        # Find which fragment this query unlocks
        for fid, frag_spec in module.manifest.fragments.items():
            if frag_spec.unlocked_by == matched_key:
                fragment_id = fid
                break
        if fragment_id:
            if session_store.unlock_fragment(session_id, fragment_id):
                unlocked_fragment = fragment_id

    return QueryResult(
        columns=columns,
        rows=rows,
        row_count=row_count,
        execution_time_ms=execution_ms,
        unlocked_fragment=unlocked_fragment,
    )


def get_fragment(module_id: str, fragment_id: str) -> str | None:
    module = load_module(module_id)
    return module.fragments.get(fragment_id)


def get_solution(module_id: str) -> str:
    module = load_module(module_id)
    return module.solution_md