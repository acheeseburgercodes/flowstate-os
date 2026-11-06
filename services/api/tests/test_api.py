from fastapi.testclient import TestClient

from app.database import Base, make_engine
from app.main import create_app

TOKEN = "test-device-token-" + "a" * 32


def test_persistence_and_authorization(tmp_path):
    url = f"sqlite:///{tmp_path / 'test.db'}"
    engine = make_engine(url)
    Base.metadata.create_all(engine)
    engine.dispose()
    headers = {"Authorization": f"Bearer {TOKEN}"}
    with TestClient(create_app(url, TOKEN)) as client:
        assert client.get("/api/v1/workspaces").status_code == 401
        assert (
            client.get(
                "/api/v1/workspaces",
                headers={**headers, "Origin": "https://evil.example"},
            ).status_code
            == 403
        )
        assert (
            client.get("/api/v1/health", headers={"Host": "evil.example"}).status_code
            == 400
        )
        created = client.post(
            "/api/v1/workspaces",
            headers=headers,
            json={
                "name": "Frontend",
                "resources": [{"kind": "web_resource", "url": "https://react.dev"}],
            },
        )
        assert created.status_code == 201, created.text
        id = created.json()["id"]
        assert (
            client.put(
                f"/api/v1/workspaces/{id}", headers=headers, json={"name": "Sprint"}
            ).status_code
            == 200
        )
    with TestClient(create_app(url, TOKEN)) as client:
        assert (
            client.get(f"/api/v1/workspaces/{id}", headers=headers).json()["name"]
            == "Sprint"
        )
        assert len(client.get("/api/v1/workspaces", headers=headers).json()) == 1
        assert (
            client.delete(f"/api/v1/workspaces/{id}", headers=headers).status_code
            == 204
        )
        assert (
            client.get(f"/api/v1/workspaces/{id}", headers=headers).status_code == 404
        )
