from __future__ import annotations

import re
from enum import Enum
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class ValidationType(str, Enum):
    PATTERN = "pattern"
    EXACT_COLUMNS = "exact_columns"
    ROW_COUNT = "row_count"
    CUSTOM = "custom"


class QueryValidation(BaseModel):
    type: ValidationType
    # pattern
    pattern: str | None = None
    # exact_columns
    required: list[str] | None = None
    # row_count
    count: int | None = None
    # custom
    function: str | None = None  # dotted path to callable


class QuerySpec(BaseModel):
    description: str
    validation: QueryValidation
    hint: str | None = None


class FragmentSpec(BaseModel):
    unlocked_by: str | None = None  # query key from queries
    title: str


class Manifest(BaseModel):
    id: str
    title: str
    description: str
    author: str
    difficulty: int = Field(ge=1, le=5)
    estimated_time_min: int
    start_fragment: str
    fragments: dict[str, FragmentSpec]
    queries: dict[str, QuerySpec]
    success_condition: Literal["all_fragments_unlocked"] = "all_fragments_unlocked"

    @field_validator("id")
    @classmethod
    def validate_id(cls, v: str) -> str:
        if not re.match(r"^[a-z0-9_-]+$", v):
            raise ValueError("id must be lowercase alphanumeric with _ or -")
        return v


class ModuleMeta(BaseModel):
    """Manifest without validation rules (safe for frontend)."""
    id: str
    title: str
    description: str
    author: str
    difficulty: int
    estimated_time_min: int
    start_fragment: str
    fragments: dict[str, FragmentSpec]


class QueryResult(BaseModel):
    columns: list[str]
    rows: list[list[Any]]
    row_count: int
    execution_time_ms: float
    unlocked_fragment: str | None = None
    error: str | None = None


class SessionState(BaseModel):
    session_id: str
    module_id: str
    unlocked_fragments: list[str] = Field(default_factory=list)
    executed_queries: list[str] = Field(default_factory=list)
    hints_used: list[str] = Field(default_factory=list)
    start_time: float
    last_activity: float


class ModuleRecord(BaseModel):
    manifest: Manifest
    schema_sql: str
    fragments: dict[str, str]  # fragment_id -> markdown content
    solution_md: str
    db_path: Path