import asyncio
import json
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest

from app.database import Base, make_engine
from app.switch_adapter import (
    FrameState,
    SwitchClient,
    SwitchConfig,
    SwitchError,
    consume_socket,
)
from app.switch_service import SwitchService


def config():
    return SwitchConfig("http://127.0.0.1:8080", "agent-1", "fixture-key", "room-1")


def event(sequence=11, addressed=True):
    return {
        "event": "message",
        "id": sequence,
        "data": {
            "sequence": sequence,
            "room_id": "room-1",
            "payload": {
                "addressed": addressed,
                "message_id": "m-1",
                "sender": "opaque-person-id",
                "body": "Prepare a frontend workspace",
            },
        },
    }


def test_operation_discovery_and_validation():
    calls = []

    def respond(request):
        calls.append(request)
        assert request.headers["Authorization"] == "Bearer fixture-key"
        if request.url.path == "/health":
            return httpx.Response(200, json={"ok": True})
        if request.url.path.endswith("/ops"):
            return httpx.Response(
                200,
                json={
                    "operations": {
                        "list_rooms": {
                            "description": "List",
                            "input_schema": {
                                "type": "object",
                                "additionalProperties": False,
                            },
                        }
                    }
                },
            )
        assert request.url.path.endswith("/ops/list_rooms")
        assert json.loads(request.content) == {}
        return httpx.Response(200, json={"result": []})

    async def scenario():
        client = SwitchClient(config(), httpx.MockTransport(respond))
        assert (await client.probe())["operation_count"] == 1
        assert await client.operation("list_rooms", {}) == []
        with pytest.raises(SwitchError):
            await client.operation("list_rooms", {"invented": True})
        with pytest.raises(SwitchError):
            await client.operation("arbitrary_operation", {})
        await client.close()

    asyncio.run(scenario())
    assert len(calls) == 3


def test_reconnect_url_and_terminal_takeover():
    client = SwitchClient(config())
    params = parse_qs(urlsplit(client.websocket_url("connection-1", 10, 3)).query)
    assert params["start_from"] == ["10"]
    assert params["expected_generation"] == ["3"]
    state = FrameState(10, 3)
    with pytest.raises(SwitchError):
        state.control({"event": "evicted", "data": {"code": "taken_over"}})
    asyncio.run(client.close())


def test_messages_require_addressing_room_and_fresh_sequence():
    state = FrameState(10)
    state.rooms = ["room-1"]
    assert state.message(event())["sender"] == "opaque-person-id"
    assert state.message(event(addressed=False)) is None
    assert state.message(event(sequence=10)) is None
    state.rooms = []
    assert state.message(event()) is None


def test_pings_are_answered_during_slow_event_processing():
    async def scenario():
        handled = []
        persisted = []
        pong = asyncio.Event()
        state = FrameState(10)
        state.rooms = ["room-1"]

        class Socket:
            async def send(self, payload):
                assert json.loads(payload) == {"type": "pong", "cursor": 10}
                pong.set()

            async def frames(self):
                yield json.dumps(event())
                yield json.dumps({"event": "ping", "data": {}})
                await pong.wait()

            def __aiter__(self):
                return self.frames()

        async def process(message, gap):
            await asyncio.wait_for(pong.wait(), 1)
            handled.append(message)

        async def persist(current):
            persisted.append(current.cursor)

        await asyncio.wait_for(consume_socket(Socket(), state, persist, process), 2)
        assert len(handled) == 1
        assert persisted == [11]

    asyncio.run(scenario())


def test_durable_event_dedup_and_cursor(tmp_path, monkeypatch):
    for key, value in {
        "SWITCH_BASE_URL": "http://127.0.0.1:8080",
        "SWITCH_AGENT_ID": "agent-1",
        "SWITCH_AGENT_API_KEY": "fixture-key",
        "SWITCH_ROOM_ID": "room-1",
    }.items():
        monkeypatch.setenv(key, value)
    engine = make_engine(f"sqlite:///{tmp_path / 'switch.db'}")
    Base.metadata.create_all(engine)
    first = SwitchService(engine)
    first.load_state()
    first.state.rooms = ["room-1"]
    message = first.state.message(event())
    first.save_message(message, False)
    first.save_message(message, False)
    first.state.cursor = 11
    first.state.generation = 2
    first.save_state()
    second = SwitchService(engine)
    second.load_state()
    assert second.connection_id == first.connection_id
    assert second.state.cursor == 11
    assert len(second.messages()) == 1
    asyncio.run(first.close())
    asyncio.run(second.close())
    engine.dispose()


def test_remote_plaintext_config_is_rejected(monkeypatch):
    monkeypatch.setenv("SWITCH_BASE_URL", "http://remote.example")
    for key in ("SWITCH_AGENT_ID", "SWITCH_AGENT_API_KEY", "SWITCH_ROOM_ID"):
        monkeypatch.setenv(key, "fixture")
    with pytest.raises(SwitchError):
        SwitchConfig.from_environment()
