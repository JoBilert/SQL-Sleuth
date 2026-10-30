from __future__ import annotations

import secrets
import time
from dataclasses import dataclass, field
from typing import Any

from engine.models import SessionState


@dataclass
class SessionStore:
    """In-memory session store. Replace with Redis/file for persistence."""
    _sessions: dict[str, SessionState] = field(default_factory=dict)

    def create(self, module_id: str) -> SessionState:
        session_id = secrets.token_urlsafe(16)
        now = time.time()
        state = SessionState(
            session_id=session_id,
            module_id=module_id,
            unlocked_fragments=[],  # Start fragment added by loader
            start_time=now,
            last_activity=now,
        )
        self._sessions[session_id] = state
        return state

    def get(self, session_id: str) -> SessionState | None:
        return self._sessions.get(session_id)

    def update_activity(self, session_id: str) -> None:
        if session_id in self._sessions:
            self._sessions[session_id].last_activity = time.time()

    def unlock_fragment(self, session_id: str, fragment_id: str) -> bool:
        state = self._sessions.get(session_id)
        if not state or fragment_id in state.unlocked_fragments:
            return False
        state.unlocked_fragments.append(fragment_id)
        self.update_activity(session_id)
        return True

    def record_query(self, session_id: str, sql: str) -> None:
        state = self._sessions.get(session_id)
        if state:
            state.executed_queries.append(sql)
            self.update_activity(session_id)

    def record_hint(self, session_id: str, query_key: str) -> None:
        state = self._sessions.get(session_id)
        if state and query_key not in state.hints_used:
            state.hints_used.append(query_key)
            self.update_activity(session_id)

    def get_stats(self, session_id: str) -> dict[str, Any] | None:
        state = self._sessions.get(session_id)
        if not state:
            return None
        return {
            "session_id": state.session_id,
            "module_id": state.module_id,
            "unlocked_count": len(state.unlocked_fragments),
            "queries_count": len(state.executed_queries),
            "hints_used": len(state.hints_used),
            "duration_seconds": time.time() - state.start_time,
        }

    def cleanup_old(self, max_age_seconds: int = 3600) -> int:
        """Remove sessions older than max_age_seconds. Returns count removed."""
        now = time.time()
        to_remove = [
            sid for sid, s in self._sessions.items()
            if now - s.last_activity > max_age_seconds
        ]
        for sid in to_remove:
            del self._sessions[sid]
        return len(to_remove)


session_store = SessionStore()