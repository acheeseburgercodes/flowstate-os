import json
import time
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.main import create_app

TOKEN = 'agent-test-' + 'a' * 32


def test_agent_jobs_execute_and_require_auth(tmp_path, monkeypatch):
    monkeypatch.setattr('app.agents.shutil.which', lambda _: 'codex')
    calls = []

    def run(command, **kwargs):
        calls.append((command, kwargs))
        return SimpleNamespace(returncode=0, stdout=json.dumps({
            'type': 'item.completed',
            'item': {'type': 'agent_message', 'text': 'Verified answer'},
        }))

    monkeypatch.setattr('app.agents.subprocess.run', run)
    with TestClient(create_app(f"sqlite:///{tmp_path / 'jobs.db'}", TOKEN)) as client:
        payload = {'specialist': 'Research', 'prompt': 'Inspect the plan'}
        assert client.post('/api/v1/agents/jobs', json=payload).status_code == 401
        headers = {'Authorization': f'Bearer {TOKEN}'}
        response = client.post('/api/v1/agents/jobs', json=payload, headers=headers)
        assert response.status_code == 202
        path = '/api/v1/agents/jobs/' + response.json()['id']
        for _ in range(100):
            job = client.get(path, headers=headers).json()
            if job['status'] == 'completed':
                break
            time.sleep(.01)
        assert job['status'] == 'completed'
        assert job['result'] == 'Verified answer'
        assert client.get(path).status_code == 401
        assert '--sandbox' in calls[0][0]
        assert 'read-only' in calls[0][0]
        assert calls[0][1]['timeout'] == 180
        assert not any(key.startswith('SWITCH_') for key in calls[0][1]['env'])


def test_missing_agent_runtime_is_actionable(tmp_path, monkeypatch):
    monkeypatch.setattr('app.agents.shutil.which', lambda _: None)
    with TestClient(create_app(f"sqlite:///{tmp_path / 'jobs.db'}", TOKEN)) as client:
        response = client.post('/api/v1/agents/jobs',
            headers={'Authorization': f'Bearer {TOKEN}'},
            json={'specialist': 'Review', 'prompt': 'Review the plan'})
        assert response.status_code == 409
