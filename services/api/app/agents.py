"""Explicit, authenticated read-only Codex jobs. No shell interpolation."""

import asyncio
import json
import os
import shutil
import subprocess
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.database import Base


class AgentJob(Base):
    __tablename__ = "agent_jobs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    specialist: Mapped[str] = mapped_column(String(80))
    prompt: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32))
    result: Mapped[str] = mapped_column(Text, default="")


class JobInput(BaseModel):
    specialist: str = Field(min_length=1, max_length=80)
    prompt: str = Field(min_length=1, max_length=4000)


def router(engine, authorize):
    routes = APIRouter(prefix="/api/v1/agents", dependencies=[Depends(authorize)])
    AgentJob.__table__.create(engine, checkfirst=True)
    # A restart never silently repeats an agent invocation.
    with Session(engine) as db:
        for job in db.query(AgentJob).filter(
            AgentJob.status.in_(["queued", "running"])
        ):
            job.status = "interrupted"
        db.commit()
    pending = set()
    slots = asyncio.Semaphore(2)

    def store(id, status, result=""):
        with Session(engine) as db:
            job = db.get(AgentJob, id)
            job.status, job.result = status, result
            db.commit()

    async def run(id, body, executable):
        async with slots:
            store(id, "running")
            try:
                command = [
                    executable,
                    "exec",
                    "--ignore-user-config",
                    "--sandbox",
                    "read-only",
                    "--ephemeral",
                    "--json",
                    "-",
                ]
                prompt = f"You are the {body.specialist} specialist. Analyze and return a useful result. Do not change files or publish messages. Task: {body.prompt}"
                result = await asyncio.to_thread(
                    subprocess.run,
                    command,
                    input=prompt,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    capture_output=True,
                    env={
                        key: value
                        for key, value in os.environ.items()
                        if not key.startswith(("SWITCH_", "FLOWSTATE_", "GATEWAY_"))
                    },
                    timeout=180,
                    cwd=os.getenv("FLOWSTATE_AGENT_WORKDIR", os.getcwd()),
                    creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
                )
                messages = []
                for line in result.stdout.splitlines():
                    try:
                        event = json.loads(line)
                        item = event.get("item", {})
                        if (
                            event.get("type") == "item.completed"
                            and item.get("type") == "agent_message"
                        ):
                            messages.append(item.get("text", ""))
                    except (ValueError, AttributeError):
                        continue
                output = "\n\n".join(messages)
                store(
                    id,
                    "completed" if result.returncode == 0 and output else "failed",
                    output[:60000]
                    or "Agent returned no final answer. Check runtime authentication and server logs.",
                )
            except subprocess.TimeoutExpired:
                store(id, "failed", "Agent exceeded the 180 second execution limit.")
            except Exception:
                store(
                    id,
                    "failed",
                    "Agent could not start. Check the server runtime configuration.",
                )

    @routes.post("/jobs", status_code=202)
    async def create(body: JobInput):
        executable = shutil.which(os.getenv("FLOWSTATE_CODEX_BINARY", "codex"))
        if not executable:
            raise HTTPException(409, "Codex runtime is not installed on this API host")
        if len(pending) >= 10:
            raise HTTPException(429, "Agent queue is full")
        id = str(uuid4())
        with Session(engine) as db:
            db.add(
                AgentJob(
                    id=id,
                    specialist=body.specialist,
                    prompt=body.prompt,
                    status="queued",
                )
            )
            db.commit()
        task = asyncio.create_task(run(id, body, executable))
        pending.add(task)
        task.add_done_callback(pending.discard)
        return {"id": id, "status": "queued"}

    @routes.get("/jobs/{id}")
    def get(id: str):
        with Session(engine) as db:
            job = db.get(AgentJob, id)
            if not job:
                raise HTTPException(404, "Job not found")
            return {"id": job.id, "status": job.status, "result": job.result}

    return routes
