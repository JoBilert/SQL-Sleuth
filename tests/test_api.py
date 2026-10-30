import pytest
from httpx import ASGITransport, AsyncClient

from engine.main import app


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_list_modules(client):
    r = await client.get("/api/modules")
    assert r.status_code == 200
    modules = r.json()
    assert len(modules) >= 1
    assert modules[0]["id"] == "fall_01"


@pytest.mark.asyncio
async def test_get_module(client):
    r = await client.get("/api/modules/fall_01")
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == "fall_01"
    assert "fragments" in data


@pytest.mark.asyncio
async def test_get_schema(client):
    r = await client.get("/api/modules/fall_01/schema")
    assert r.status_code == 200
    schema = r.json()
    assert "personen" in schema
    assert "beweise" in schema


@pytest.mark.asyncio
async def test_session_flow(client):
    # Create session
    r = await client.post("/api/modules/fall_01/session")
    assert r.status_code == 200
    session_id = r.json()["session_id"]

    # Start fragment accessible
    r = await client.get(f"/api/modules/fall_01/fragment/01_intro?session_id={session_id}")
    assert r.status_code == 200

    # Locked fragment not accessible
    r = await client.get(f"/api/modules/fall_01/fragment/02_witness?session_id={session_id}")
    assert r.status_code == 403

    # Execute witness query
    r = await client.post(
        "/api/modules/fall_01/query",
        json={
            "session_id": session_id,
            "sql": "SELECT * FROM beweise JOIN personen ON beweise.person_id = personen.id WHERE zeit BETWEEN '20:00' AND '20:30' AND raum_id = 1",
        },
    )
    assert r.status_code == 200
    assert r.json()["unlocked_fragment"] == "02_witness"

    # Now fragment accessible
    r = await client.get(f"/api/modules/fall_01/fragment/02_witness?session_id={session_id}")
    assert r.status_code == 200

    # Execute fingerprint query
    r = await client.post(
        "/api/modules/fall_01/query",
        json={
            "session_id": session_id,
            "sql": "SELECT beweise.person_id, personen.name, beweise.fingerprint_match FROM beweise JOIN personen ON beweise.person_id = personen.id WHERE beweise.typ = 'fingerprint' AND beweise.fingerprint_match = 1",
        },
    )
    assert r.status_code == 200
    assert r.json()["unlocked_fragment"] == "03_fingerprint"

    # Execute motive query
    r = await client.post(
        "/api/modules/fall_01/query",
        json={
            "session_id": session_id,
            "sql": "SELECT * FROM personen WHERE rolle = 'butler' AND schulden > 0",
        },
    )
    assert r.status_code == 200
    assert r.json()["unlocked_fragment"] == "04_motive"

    # Solve
    r = await client.post(
        "/api/modules/fall_01/solve", json={"session_id": session_id}
    )
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert data["solution"] is not None
    assert "05_solution" in data["unlocked"]


@pytest.mark.asyncio
async def test_security_no_write(client):
    r = await client.post("/api/modules/fall_01/session")
    session_id = r.json()["session_id"]

    # Try INSERT - should fail
    r = await client.post(
        "/api/modules/fall_01/query",
        json={"session_id": session_id, "sql": "INSERT INTO personen VALUES (99, 'hacker', 'hacker', 0, 'nowhere')"},
    )
    assert r.status_code == 200
    assert r.json()["error"] is not None

    # Try DROP - should fail
    r = await client.post(
        "/api/modules/fall_01/query",
        json={"session_id": session_id, "sql": "DROP TABLE personen"},
    )
    assert r.status_code == 200
    assert r.json()["error"] is not None