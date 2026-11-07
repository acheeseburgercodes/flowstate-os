import asyncio
import hashlib
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import DateTime, Integer, String, UniqueConstraint, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Mapped, Session, mapped_column
from websockets.asyncio.client import connect
from websockets.exceptions import ConnectionClosed, InvalidHandshake

from app.database import Base
from app.switch_adapter import (
    FrameState,
    SwitchClient,
    SwitchConfig,
    SwitchError,
    consume_socket,
)


class SwitchConnection(Base):
    __tablename__ = "switch_connections"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    connection_id: Mapped[str] = mapped_column(String(36))
    cursor: Mapped[int | None] = mapped_column(Integer, nullable=True)
    generation: Mapped[int | None] = mapped_column(Integer, nullable=True)
    gap: Mapped[bool] = mapped_column(default=False)


class SwitchMessage(Base):
    __tablename__ = "switch_messages"
    __table_args__ = (UniqueConstraint("connection_key", "room_id", "message_id"),)
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    connection_key: Mapped[str] = mapped_column(String(64), index=True)
    room_id: Mapped[str] = mapped_column(String(256))
    message_id: Mapped[str] = mapped_column(String(256))
    sender: Mapped[str] = mapped_column(String(512))
    body: Mapped[str] = mapped_column(String(65536))
    sequence: Mapped[int] = mapped_column(Integer)
    history_gap: Mapped[bool] = mapped_column(default=False)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class SwitchService:
    def __init__(self, engine):
        self.engine = engine
        self.client = None
        self.task = None
        self.state = FrameState()
        self.status = "not_configured"
        self.error = None
        self.connection_id = None
        self.key = None
        self.lifecycle_lock = asyncio.Lock()
        try:
            config = SwitchConfig.from_environment()
            if config:
                self.client = SwitchClient(config)
                self.status = "disconnected"
                self.key = hashlib.sha256(
                    f"{config.base_url}|{config.agent_id}|{config.room_id}".encode()
                ).hexdigest()
        except SwitchError as error:
            self.status, self.error = "configuration_error", str(error)

    def load_state(self):
        with Session(self.engine) as db:
            row = db.get(SwitchConnection, self.key)
            if row is None:
                row = SwitchConnection(key=self.key, connection_id=str(uuid4()))
                db.add(row)
                db.commit()
                db.refresh(row)
            self.connection_id = row.connection_id
            self.state = FrameState(row.cursor, row.generation)
            self.state.gap = row.gap

    def save_state(self):
        with Session(self.engine) as db:
            row = db.get(SwitchConnection, self.key)
            row.cursor, row.generation, row.gap = (
                self.state.cursor,
                self.state.generation,
                self.state.gap,
            )
            db.commit()

    def save_message(self, message, gap):
        with Session(self.engine) as db:
            db.add(SwitchMessage(connection_key=self.key, history_gap=gap, **message))
            try:
                db.commit()
            except IntegrityError:
                db.rollback()
                existing = db.scalar(
                    select(SwitchMessage.id).where(
                        SwitchMessage.connection_key == self.key,
                        SwitchMessage.room_id == message["room_id"],
                        SwitchMessage.message_id == message["message_id"],
                    )
                )
                if existing is None:
                    raise

    async def start(self):
        async with self.lifecycle_lock:
            await self._start()

    async def _start(self):
        if self.client is None:
            raise SwitchError(self.error or "Switch is not configured")
        if self.task and not self.task.done():
            return
        await self.client.probe()
        await asyncio.to_thread(self.load_state)
        self.error = None
        self.status = "connecting"
        self.task = asyncio.create_task(self.run())

    async def run(self):
        delay = 1
        while True:
            try:
                async with connect(
                    self.client.websocket_url(
                        self.connection_id, self.state.cursor, self.state.generation
                    ),
                    additional_headers={
                        "Authorization": f"Bearer {self.client.config.api_key}"
                    },
                    max_size=262144,
                    open_timeout=15,
                    ping_interval=None,
                ) as socket:

                    async def persist(state):
                        await asyncio.to_thread(self.save_state)
                        self.status = (
                            "connected"
                            if set(self.client.config.room_ids).issubset(state.rooms)
                            and state.connected
                            else "room_unavailable"
                        )

                    async def ingest(message, gap):
                        if message["room_id"] not in self.client.config.room_ids:
                            return
                        if len(message["body"]) > 65536:
                            raise SwitchError(
                                "Room message exceeds FlowState's size limit"
                            )
                        await asyncio.to_thread(self.save_message, message, gap)

                    await consume_socket(socket, self.state, persist, ingest)
                    self.status = "disconnected"
                    return
            except asyncio.CancelledError:
                raise
            except SwitchError as error:
                self.status, self.error = "attention_required", str(error)
                return
            except ConnectionClosed as error:
                if error.code in {4400, 4401, 4403, 4409}:
                    self.status, self.error = (
                        "attention_required",
                        f"Switch refused connection ({error.code})",
                    )
                    return
            except (OSError, TimeoutError, ConnectionError):
                pass
            except (
                ValueError,
                TypeError,
                KeyError,
                asyncio.QueueFull,
                SQLAlchemyError,
                InvalidHandshake,
            ):
                self.status, self.error = (
                    "attention_required",
                    "Switch protocol or persistence error; inspect configuration before reconnecting",
                )
                return
            self.status = "reconnecting"
            await asyncio.sleep(delay)
            delay = min(delay * 2, 30)

    async def stop(self):
        async with self.lifecycle_lock:
            await self._stop()

    async def _stop(self):
        if self.task:
            self.task.cancel()
            await asyncio.gather(self.task, return_exceptions=True)
            self.task = None
        self.state.connected = False
        self.status = "disconnected" if self.client else self.status

    async def close(self):
        await self.stop()
        if self.client:
            await self.client.close()

    def summary(self):
        return {
            "status": self.status,
            "error": self.error,
            "rooms": self.state.rooms if self.state.connected else [],
            "history_gap": self.state.gap,
            "operation_count": len(self.client.operations) if self.client else 0,
            "configured_rooms": list(self.client.config.room_ids) if self.client else [],
        }

    def messages(self):
        if not self.key:
            return []
        with Session(self.engine) as db:
            rows = db.scalars(
                select(SwitchMessage)
                .where(SwitchMessage.connection_key == self.key)
                .order_by(SwitchMessage.received_at.desc())
                .limit(100)
            )
            return [
                {
                    "id": row.id,
                    "room_id": row.room_id,
                    "sender": row.sender,
                    "body": row.body,
                    "history_gap": row.history_gap,
                    "received_at": row.received_at.isoformat(),
                }
                for row in rows
            ]
