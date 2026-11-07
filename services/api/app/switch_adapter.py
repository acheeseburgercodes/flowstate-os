"""Released Switch Agent Bridge protocol. No room bus or routing implementation."""

import asyncio
import json
import os
from dataclasses import dataclass
from urllib.parse import quote, urlencode, urlsplit

import httpx
from jsonschema import Draft202012Validator


class SwitchError(Exception):
    pass


@dataclass(frozen=True)
class SwitchConfig:
    base_url: str
    agent_id: str
    api_key: str
    room_id: str

    @classmethod
    def from_environment(cls):
        values = [
            os.getenv(key, "").strip()
            for key in (
                "SWITCH_BASE_URL",
                "SWITCH_AGENT_ID",
                "SWITCH_AGENT_API_KEY",
                "SWITCH_ROOM_ID",
            )
        ]
        if not any(values):
            return None
        if not all(values):
            raise SwitchError(
                "Set all four SWITCH_BASE_URL, SWITCH_AGENT_ID, SWITCH_AGENT_API_KEY, and SWITCH_ROOM_ID variables"
            )
        parts = urlsplit(values[0])
        if parts.username or parts.password or parts.query or parts.fragment:
            raise SwitchError(
                "Switch base URL must not contain credentials, query, or fragment"
            )
        if parts.scheme != "https" and not (
            parts.scheme == "http"
            and parts.hostname in {"localhost", "127.0.0.1", "::1"}
        ):
            raise SwitchError(
                "Use HTTPS for a remote Switch server or HTTP on loopback"
            )
        return cls(values[0].rstrip("/"), *values[1:])


class SwitchClient:
    def __init__(self, config: SwitchConfig, transport=None):
        self.config = config
        self.http = httpx.AsyncClient(
            base_url=config.base_url + "/",
            timeout=15,
            follow_redirects=False,
            transport=transport,
            headers={"Authorization": f"Bearer {config.api_key}"},
        )
        self.operations: dict = {}

    async def close(self):
        await self.http.aclose()

    async def probe(self):
        try:
            response = await self.http.get("health")
            response.raise_for_status()
            response = await self.http.get(
                f"agents/{quote(self.config.agent_id, safe='')}/ops"
            )
            response.raise_for_status()
            body = response.json()
            operations = body.get("operations")
            if not isinstance(operations, dict) or not operations:
                raise SwitchError("Switch returned an invalid operation registry")
            for operation in operations.values():
                if not isinstance(operation, dict) or not isinstance(
                    operation.get("input_schema"), dict
                ):
                    raise SwitchError("Switch operation schema is missing")
            self.operations = operations
            return {"status": "reachable", "operation_count": len(operations)}
        except (httpx.HTTPError, ValueError) as error:
            # Do not expose provider response bodies, request headers, or credential-bearing URLs.
            raise SwitchError(
                "Switch health or authenticated operation discovery failed"
            ) from error

    async def operation(
        self, name: str, arguments: dict, connection_id: str | None = None
    ):
        if name not in {
            "list_rooms",
            "get_room_detail",
            "read_context",
            "list_participants",
            "post_message",
        }:
            raise SwitchError("Operation is not enabled by FlowState")
        if name not in self.operations:
            raise SwitchError("Operation was not discovered on this Switch instance")
        validation = list(
            Draft202012Validator(self.operations[name]["input_schema"]).iter_errors(
                arguments
            )
        )
        if validation:
            raise SwitchError(
                "Arguments do not match the discovered Switch operation schema"
            )
        headers = {"X-Switch-Connection-Id": connection_id} if connection_id else {}
        try:
            response = await self.http.post(
                f"agents/{quote(self.config.agent_id, safe='')}/ops/{name}",
                json=arguments,
                headers=headers,
            )
            response.raise_for_status()
            return response.json()["result"]
        except (httpx.HTTPError, ValueError, KeyError) as error:
            raise SwitchError(
                "Switch operation failed; no automatic write retry was attempted"
            ) from error

    def websocket_url(
        self, connection_id: str, cursor: int | None, generation: int | None
    ):
        params = {
            "connection_id": connection_id,
            "scope": "single",
            "filter": "all",
            "rooms": self.config.room_id,
            "start_from": "head" if cursor is None else str(cursor),
            "client": "flowstate",
            "client_version": "0.1.0",
        }
        if generation is not None:
            params["expected_generation"] = str(generation)
        base = self.config.base_url.replace("https://", "wss://", 1).replace(
            "http://", "ws://", 1
        )
        return f"{base}/agents/{quote(self.config.agent_id, safe='')}/connection/ws?{urlencode(params)}"


class FrameState:
    """Pure protocol state: only durable, handled events advance acknowledgement."""

    def __init__(self, cursor=None, generation=None):
        self.cursor = cursor
        self.generation = generation
        self.rooms: list[str] = []
        self.gap = False
        self.connected = False

    def control(self, frame: dict):
        kind = frame.get("event", frame.get("type"))
        data = frame.get("data", frame)
        if not isinstance(data, dict):
            raise SwitchError("Malformed Switch frame")
        if kind == "ping":
            return {"type": "pong", "cursor": self.cursor or 0}
        if kind == "connection_state":
            if (
                not isinstance(data.get("cursor"), int)
                or not isinstance(data.get("generation"), int)
                or not isinstance(data.get("rooms"), list)
            ):
                raise SwitchError("Malformed Switch connection state")
            self.cursor, self.generation, self.rooms = (
                data["cursor"],
                data["generation"],
                data["rooms"],
            )
            self.connected = True
        elif kind == "gap":
            if not isinstance(data.get("resumed_at"), int):
                raise SwitchError("Malformed gap cursor")
            self.cursor = data["resumed_at"]
            self.gap = True
        elif kind == "subscription_changed":
            self.rooms = data.get("rooms", [])
        elif kind == "room_released":
            self.rooms = [room for room in self.rooms if room != data.get("room_id")]
        elif kind == "refused" or (
            kind == "evicted"
            and data.get("code")
            not in {"heartbeat_lapsed", "no_stream", "unfenced", "connection_error"}
        ):
            self.connected = False
            raise SwitchError(
                "Switch refused or ended the connection; explicit reconnect is required"
            )
        elif kind == "evicted":
            self.connected = False
            raise ConnectionError("Recoverable Switch eviction")
        return None

    def message(self, frame: dict):
        if frame.get("event") not in {"message", "command", "room_join"}:
            return None
        sequence = frame.get("id")
        data = frame.get("data", {})
        if not isinstance(sequence, int) or data.get("sequence") != sequence:
            raise SwitchError("Invalid event sequence")
        if self.cursor is not None and sequence <= self.cursor:
            return None
        if frame["event"] != "message":
            return None
        payload = data.get("payload", {})
        if (
            payload.get("addressed") is not True
            or data.get("room_id") not in self.rooms
        ):
            return None
        if not all(
            isinstance(payload.get(key), str)
            for key in ("message_id", "sender", "body")
        ):
            raise SwitchError("Invalid message payload")
        return {
            "sequence": sequence,
            "room_id": data["room_id"],
            **{key: payload[key] for key in ("message_id", "sender", "body")},
        }


async def consume_socket(socket, state: FrameState, persist, handle_message):
    """Keep pongs responsive while ordered persistence runs off the reader task."""
    queue = asyncio.Queue(maxsize=256)

    async def worker():
        while True:
            frame = await queue.get()
            reply = state.control(frame)
            if reply is not None:
                continue
            message = state.message(frame)
            if message is not None:
                await handle_message(message, state.gap)
            if frame.get("event") in {"message", "command", "room_join"} and isinstance(
                frame.get("id"), int
            ):
                state.cursor = max(state.cursor or 0, frame["id"])
            await persist(state)
            queue.task_done()

    async def reader():
        async for raw in socket:
            frame = json.loads(raw)
            if not isinstance(frame, dict):
                raise SwitchError("Invalid Switch frame")
            if frame.get("event", frame.get("type")) == "ping":
                await socket.send(
                    json.dumps({"type": "pong", "cursor": state.cursor or 0})
                )
            else:
                queue.put_nowait(frame)
        await queue.join()

    # Cancel both sides when one fails; unacknowledged events replay after reconnect.
    tasks = [asyncio.create_task(worker()), asyncio.create_task(reader())]
    try:
        done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            task.result()
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
