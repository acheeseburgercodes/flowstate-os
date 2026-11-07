"""Revision-bound human decisions. Approval here never authorizes native execution."""

from datetime import UTC, datetime
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import JSON, DateTime, Integer, String, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.database import Base
from app.schemas import WorkspaceManifest
from app.switch_adapter import SwitchError
from app.switch_service import SwitchMessage


class Proposal(Base):
    __tablename__ = "proposals"
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    idempotency_key: Mapped[str] = mapped_column(String(36), unique=True)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    state: Mapped[str] = mapped_column(String(32), default="draft")
    manifest: Mapped[dict] = mapped_column(JSON)
    source_message_ids: Mapped[list] = mapped_column(JSON, default=list)
    publication: Mapped[str] = mapped_column(String(32), default="not_sent")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class NewProposal(BaseModel):
    model_config = ConfigDict(extra="forbid")
    idempotency_key: UUID
    manifest: WorkspaceManifest
    source_message_ids: list[UUID] = Field(default_factory=list, max_length=100)


class EditProposal(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(ge=1)
    manifest: WorkspaceManifest


class Decision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(ge=1)
    decision: Literal["approve", "reject"]


class Publish(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(ge=1)


def output(row):
    return {
        "id": row.id,
        "revision": row.revision,
        "state": row.state,
        "manifest": row.manifest,
        "source_message_ids": row.source_message_ids,
        "publication": row.publication,
        "local_approval_required": True,
        "created_at": row.created_at.isoformat(),
    }


def router(engine, authorize, switch):
    routes = APIRouter(prefix="/api/v1/proposals", dependencies=[Depends(authorize)])

    def get(db, id):
        row = db.get(Proposal, str(id))
        if row is None:
            raise HTTPException(404, "Plan not found")
        return row

    def validate_sources(db, ids, manifest):
        for id in ids:
            message = db.get(SwitchMessage, str(id))
            if (
                message is None
                or message.room_id != manifest.switch_room_id
                or message.connection_key != switch.key
            ):
                raise HTTPException(
                    422, "Source message does not belong to the configured room"
                )
            if message.history_gap:
                raise HTTPException(
                    409,
                    "Source has incomplete history; reconcile the room before proposing a plan",
                )

    @routes.get("")
    def list_proposals():
        with Session(engine) as db:
            return [
                output(row)
                for row in db.scalars(
                    select(Proposal).order_by(Proposal.created_at.desc()).limit(100)
                )
            ]

    @routes.post("", status_code=201)
    def create(body: NewProposal):
        manifest = body.manifest.model_dump(mode="json")
        sources = [str(id) for id in body.source_message_ids]
        with Session(engine) as db:
            prior = db.scalar(
                select(Proposal).where(
                    Proposal.idempotency_key == str(body.idempotency_key)
                )
            )
            if prior:
                if prior.manifest != manifest or prior.source_message_ids != sources:
                    raise HTTPException(
                        409, "Idempotency key was already used for different content"
                    )
                return output(prior)
            validate_sources(db, sources, body.manifest)
            row = Proposal(
                idempotency_key=str(body.idempotency_key),
                manifest=manifest,
                source_message_ids=sources,
            )
            db.add(row)
            try:
                db.commit()
            except IntegrityError as error:
                raise HTTPException(
                    409, "Concurrent duplicate request; reload plans"
                ) from error
            db.refresh(row)
            return output(row)

    @routes.put("/{id}")
    def edit(id: UUID, body: EditProposal):
        with Session(engine) as db:
            row = get(db, id)
            validate_sources(db, row.source_message_ids, body.manifest)
            changed = db.execute(
                update(Proposal)
                .where(
                    Proposal.id == str(id),
                    Proposal.revision == body.revision,
                    Proposal.state == "draft",
                )
                .values(
                    manifest=body.manifest.model_dump(mode="json"),
                    revision=body.revision + 1,
                )
            ).rowcount
            if changed != 1:
                raise HTTPException(
                    409, "Plan changed or was already decided; reload before editing"
                )
            db.commit()
            return output(get(db, id))

    @routes.post("/{id}/decision")
    def decide(id: UUID, body: Decision):
        with Session(engine) as db:
            changed = db.execute(
                update(Proposal)
                .where(
                    Proposal.id == str(id),
                    Proposal.revision == body.revision,
                    Proposal.state == "draft",
                )
                .values(state="approved" if body.decision == "approve" else "rejected")
            ).rowcount
            if changed != 1:
                raise HTTPException(409, "Decision requires the current draft revision")
            db.commit()
            return output(get(db, id))

    @routes.post("/{id}/publish")
    async def publish(id: UUID, body: Publish):
        # No automatic retries: a timeout after posting has an uncertain outcome.
        if switch.client is None:
            raise HTTPException(409, "Switch is not configured")
        with Session(engine) as db:
            row = get(db, id)
            if row.manifest["switch_room_id"] != switch.client.config.room_id:
                raise HTTPException(
                    409, "Plan is not bound to the configured Switch room"
                )
            if switch.state.gap:
                raise HTTPException(
                    409, "Reconcile missing Switch history before publishing"
                )
            changed = db.execute(
                update(Proposal)
                .where(
                    Proposal.id == str(id),
                    Proposal.revision == body.revision,
                    Proposal.state == "approved",
                    Proposal.publication == "not_sent",
                )
                .values(publication="sending")
            ).rowcount
            if changed != 1:
                raise HTTPException(
                    409, "Only an approved, unpublished revision can be published"
                )
            manifest = WorkspaceManifest.model_validate(row.manifest)
            db.commit()
        content = (
            f"FlowState plan {id}, revision {body.revision}: {manifest.name}\nLocal device approval is still required.\n"
            + manifest.model_dump_json(indent=2)
        )
        try:
            await switch.client.publish_message(manifest.switch_room_id, content)
        except SwitchError as error:
            with Session(engine) as db:
                db.execute(
                    update(Proposal)
                    .where(Proposal.id == str(id))
                    .values(publication="unknown")
                )
                db.commit()
            raise HTTPException(
                502,
                "Publication outcome is unknown. Check the room before any manual resend.",
            ) from error
        with Session(engine) as db:
            db.execute(
                update(Proposal)
                .where(Proposal.id == str(id))
                .values(publication="sent")
            )
            db.commit()
            return output(get(db, id))

    return routes
