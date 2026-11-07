from uuid import uuid4

from fastapi.testclient import TestClient

from app.database import Base, make_engine
from app.main import create_app
from app.switch_adapter import SwitchClient, SwitchError


def test_revision_bound_approval_idempotency_and_no_native_execution(tmp_path):
    url = f"sqlite:///{tmp_path / 'plans.db'}"
    engine = make_engine(url)
    Base.metadata.create_all(engine)
    engine.dispose()
    token = "test-only-" + "x" * 40
    with TestClient(create_app(url, token)) as client:
        headers = {"Authorization": f"Bearer {token}"}
        body = {
            "idempotency_key": str(uuid4()),
            "manifest": {
                "workspace_id": str(uuid4()),
                "name": "Sprint",
                "switch_room_id": "room-1",
                "resources": [{"kind": "web_resource", "url": "https://react.dev"}],
            },
        }
        created = client.post("/api/v1/proposals", headers=headers, json=body)
        assert created.status_code == 201, created.text
        plan = created.json()
        assert (
            client.post("/api/v1/proposals", headers=headers, json=body).json()["id"]
            == plan["id"]
        )
        body["manifest"]["name"] = "Revised sprint"
        assert (
            client.post("/api/v1/proposals", headers=headers, json=body).status_code
            == 409
        )
        path = f"/api/v1/proposals/{plan['id']}"
        edited = client.put(
            path, headers=headers, json={"revision": 1, "manifest": body["manifest"]}
        )
        assert edited.json()["revision"] == 2
        assert (
            client.post(
                path + "/decision",
                headers=headers,
                json={"revision": 1, "decision": "approve"},
            ).status_code
            == 409
        )
        approved = client.post(
            path + "/decision",
            headers=headers,
            json={"revision": 2, "decision": "approve"},
        ).json()
        assert approved["state"] == "approved"
        assert approved["local_approval_required"] is True
        assert (
            client.put(
                path,
                headers=headers,
                json={"revision": 2, "manifest": body["manifest"]},
            ).status_code
            == 409
        )
        assert (
            client.post(
                path + "/publish", headers=headers, json={"revision": 2}
            ).status_code
            == 409
        )
        assert client.get("/api/v1/proposals").status_code == 401


def test_unknown_publication_is_not_retried(tmp_path, monkeypatch):
    for key, value in {
        "SWITCH_BASE_URL": "http://127.0.0.1:8080",
        "SWITCH_AGENT_ID": "fixture",
        "SWITCH_AGENT_API_KEY": "fixture",
        "SWITCH_ROOM_ID": "fixture-room",
    }.items():
        monkeypatch.setenv(key, value)
    attempts = []

    async def uncertain(self, room_id, content):
        attempts.append((room_id, content))
        raise SwitchError("Response lost after send")

    monkeypatch.setattr(SwitchClient, "publish_message", uncertain)
    url = f"sqlite:///{tmp_path / 'publication.db'}"
    engine = make_engine(url)
    Base.metadata.create_all(engine)
    engine.dispose()
    token = "test-only-" + "x" * 40
    with TestClient(create_app(url, token)) as client:
        headers = {"Authorization": f"Bearer {token}"}
        plan = client.post(
            "/api/v1/proposals",
            headers=headers,
            json={
                "idempotency_key": str(uuid4()),
                "manifest": {
                    "workspace_id": str(uuid4()),
                    "name": "Publish fixture",
                    "switch_room_id": "fixture-room",
                },
            },
        ).json()
        path = f"/api/v1/proposals/{plan['id']}"
        client.post(
            path + "/decision",
            headers=headers,
            json={"revision": 1, "decision": "approve"},
        )
        assert (
            client.post(
                path + "/publish", headers=headers, json={"revision": 1}
            ).status_code
            == 502
        )
        assert (
            client.post(
                path + "/publish", headers=headers, json={"revision": 1}
            ).status_code
            == 409
        )
        assert (
            client.get("/api/v1/proposals", headers=headers).json()[0]["publication"]
            == "unknown"
        )
    assert len(attempts) == 1
    assert "Local device approval is still required" in attempts[0][1]
