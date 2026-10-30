from __future__ import annotations

import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from engine.loader import list_modules, load_module, get_schema_info, MODULES_DIR
from engine.models import Manifest, ModuleMeta, QueryResult, SessionState
from engine.session import session_store
from engine.executor import execute_query, get_fragment, get_solution


FRONTEND_DIR = Path(__file__).parent.parent / "frontend"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure modules dir exists
    MODULES_DIR.mkdir(exist_ok=True)
    # Periodic cleanup could go here
    yield
    # Shutdown


app = FastAPI(title="SQL Game Engine", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Module endpoints ---

@app.get("/api/modules", response_model=list[ModuleMeta])
async def api_list_modules():
    return list_modules()


@app.get("/api/modules/{module_id}", response_model=ModuleMeta)
async def api_get_module(module_id: str):
    try:
        module = load_module(module_id)
        return ModuleMeta(
            id=module.manifest.id,
            title=module.manifest.title,
            description=module.manifest.description,
            author=module.manifest.author,
            difficulty=module.manifest.difficulty,
            estimated_time_min=module.manifest.estimated_time_min,
            start_fragment=module.manifest.start_fragment,
            fragments=module.manifest.fragments,
        )
    except FileNotFoundError:
        raise HTTPException(404, "Module not found")


@app.get("/api/modules/{module_id}/schema")
async def api_get_schema(module_id: str):
    try:
        return get_schema_info(module_id)
    except FileNotFoundError:
        raise HTTPException(404, "Module not found")


# --- Session endpoints ---

@app.post("/api/modules/{module_id}/session")
async def api_create_session(module_id: str):
    try:
        module = load_module(module_id)  # Validate exists
    except FileNotFoundError:
        raise HTTPException(404, "Module not found")

    session = session_store.create(module_id)
    # Auto-unlock start fragment
    session_store.unlock_fragment(session.session_id, module.manifest.start_fragment)
    return {"session_id": session.session_id}


# --- Query endpoint ---

@app.post("/api/modules/{module_id}/query", response_model=QueryResult)
async def api_execute_query(module_id: str, request: Request):
    body = await request.json()
    session_id = body.get("session_id")
    sql = body.get("sql", "").strip()

    if not session_id or not sql:
        raise HTTPException(400, "session_id and sql required")

    return execute_query(module_id, session_id, sql)


# --- Fragment endpoints ---

@app.get("/api/modules/{module_id}/fragment/{fragment_id}")
async def api_get_fragment(module_id: str, fragment_id: str, session_id: str):
    session = session_store.get(session_id)
    if not session or session.module_id != module_id:
        raise HTTPException(403, "Invalid session")

    module = load_module(module_id)
    if fragment_id not in module.manifest.fragments:
        raise HTTPException(404, "Fragment not found")

    # Check if unlocked
    if fragment_id != module.manifest.start_fragment and fragment_id not in session.unlocked_fragments:
        raise HTTPException(403, "Fragment locked")

    content = get_fragment(module_id, fragment_id)
    if content is None:
        raise HTTPException(404, "Fragment not found")

    return {"fragment_id": fragment_id, "content": content, "title": module.manifest.fragments[fragment_id].title}


# --- Solve endpoint ---

@app.post("/api/modules/{module_id}/solve")
async def api_solve(module_id: str, request: Request):
    body = await request.json()
    session_id = body.get("session_id")

    if not session_id:
        raise HTTPException(400, "session_id required")

    session = session_store.get(session_id)
    if not session or session.module_id != module_id:
        raise HTTPException(403, "Invalid session")

    module = load_module(module_id)
    # Consider solved when all fragments except solution are unlocked
    unlockable_fragments = [fid for fid, spec in module.manifest.fragments.items() if spec.unlocked_by is not None]
    all_unlocked = set(unlockable_fragments).issubset(set(session.unlocked_fragments))

    stats = session_store.get_stats(session_id) or {}

    if all_unlocked:
        # Unlock solution fragment
        session_store.unlock_fragment(session_id, "05_solution")

    return {
        "success": all_unlocked,
        "solution": get_solution(module_id) if all_unlocked else None,
        "stats": stats,
        "unlocked": session.unlocked_fragments,
        "total": list(module.manifest.fragments.keys()),
    }


# --- Frontend serving ---

@app.get("/")
async def root():
    return FileResponse(FRONTEND_DIR / "index.html")


app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")