"""Portable collaboration data. Local machine state belongs elsewhere."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator


class SharedResource(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["git_repository", "web_resource"]
    url: HttpUrl

    @field_validator("url")
    @classmethod
    def reject_embedded_credentials(cls, value: HttpUrl) -> HttpUrl:
        if value.username or value.password:
            raise ValueError("Credentials must not be included in shared URLs")
        return value


class WorkspaceManifest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    schema_version: Literal[1] = 1
    workspace_id: UUID
    name: str = Field(min_length=1, max_length=120)
    switch_room_id: str = Field(min_length=1, max_length=256)
    resources: list[SharedResource] = Field(default_factory=list, max_length=100)
    suggested_layout: Literal["focus", "split", "coding", "research"] = "coding"
    approval_required: Literal[True] = True
