import os
import secrets
from contextlib import asynccontextmanager
from typing import Annotated, Literal
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.database import Workspace, make_engine
from app.schemas import SharedResource


class WorkspaceInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=120)
    intent: str = Field(default="", max_length=2000)
    layout: Literal["focus", "split", "coding", "research"] = "coding"
    resources: list[SharedResource] = Field(default_factory=list, max_length=100)


class WorkspaceOutput(WorkspaceInput):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    created_at: str


def serialize(workspace: Workspace):
    return {
        "id": workspace.id,
        "name": workspace.name,
        "intent": workspace.intent,
        "layout": workspace.layout,
        "resources": workspace.resources,
        "created_at": workspace.created_at.isoformat()
        + ("Z" if workspace.created_at.tzinfo is None else ""),
    }


def create_app(database_url: str | None = None, token: str | None = None):
    engine = make_engine(
        database_url or os.getenv("FLOWSTATE_DATABASE_URL", "sqlite:///./flowstate.db")
    )
    secret = token or os.getenv("FLOWSTATE_API_TOKEN", "")

    @asynccontextmanager
    async def lifespan(app):
        if len(secret) < 32:
            raise RuntimeError(
                "Set FLOWSTATE_API_TOKEN to a random value of at least 32 characters"
            )
        yield
        engine.dispose()

    app = FastAPI(title="FlowState OS", version="0.1.0", lifespan=lifespan)
    origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "tauri://localhost",
        "http://tauri.localhost",
    ]
    app.add_middleware(
        TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1", "testserver"]
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.middleware("http")
    async def verify_origin(request: Request, call_next):
        if request.headers.get("origin") and request.headers["origin"] not in origins:
            return Response("Origin not permitted", status_code=403)
        return await call_next(request)

    bearer = HTTPBearer(auto_error=False)

    def authorize(
        credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    ):
        if (
            not secret
            or credentials is None
            or not secrets.compare_digest(credentials.credentials, secret)
        ):
            raise HTTPException(
                401, "Device token required", headers={"WWW-Authenticate": "Bearer"}
            )

    def session():
        with Session(engine) as db:
            yield db

    db_dependency = Annotated[Session, Depends(session)]
    auth = [Depends(authorize)]

    @app.get("/api/v1/health")
    def health():
        return {"status": "ok", "desktop": "unavailable", "switch": "not_configured"}

    @app.get(
        "/api/v1/workspaces", dependencies=auth, response_model=list[WorkspaceOutput]
    )
    def list_workspaces(db: db_dependency):
        return [
            serialize(w)
            for w in db.scalars(select(Workspace).order_by(Workspace.created_at.desc()))
        ]

    @app.post(
        "/api/v1/workspaces",
        dependencies=auth,
        status_code=201,
        response_model=WorkspaceOutput,
    )
    def create_workspace(body: WorkspaceInput, db: db_dependency):
        workspace = Workspace(**body.model_dump(mode="json"))
        db.add(workspace)
        db.commit()
        db.refresh(workspace)
        return serialize(workspace)

    def find(db: Session, id: UUID):
        workspace = db.get(Workspace, str(id))
        if workspace is None:
            raise HTTPException(404, "Workspace not found")
        return workspace

    @app.get(
        "/api/v1/workspaces/{id}", dependencies=auth, response_model=WorkspaceOutput
    )
    def get_workspace(id: UUID, db: db_dependency):
        return serialize(find(db, id))

    @app.put(
        "/api/v1/workspaces/{id}", dependencies=auth, response_model=WorkspaceOutput
    )
    def update_workspace(id: UUID, body: WorkspaceInput, db: db_dependency):
        workspace = find(db, id)
        for key, value in body.model_dump(mode="json").items():
            setattr(workspace, key, value)
        db.commit()
        db.refresh(workspace)
        return serialize(workspace)

    @app.delete("/api/v1/workspaces/{id}", dependencies=auth, status_code=204)
    def delete_workspace(id: UUID, db: db_dependency):
        db.delete(find(db, id))
        db.commit()
        return Response(status_code=204)

    return app


app = create_app()
