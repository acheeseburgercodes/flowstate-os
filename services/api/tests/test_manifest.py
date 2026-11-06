from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas import WorkspaceManifest


def manifest(**changes):
    return {
        "workspace_id": str(uuid4()),
        "name": "Frontend sprint",
        "switch_room_id": "room-1",
        **changes,
    }


def test_portable_manifest_requires_local_approval():
    result = WorkspaceManifest.model_validate(
        manifest(resources=[{"kind": "web_resource", "url": "https://react.dev"}])
    )
    assert result.approval_required is True


@pytest.mark.parametrize(
    "changes",
    [
        {"approval_required": False},
        {"local_path": "C:/private/project"},
        {"resources": [{"kind": "web_resource", "url": "file:///C:/private"}]},
        {
            "resources": [
                {"kind": "web_resource", "url": "https://user:secret@example.com"}
            ]
        },
        {"schema_version": 2},
    ],
)
def test_rejects_unsafe_or_unsupported_manifest(changes):
    with pytest.raises(ValidationError):
        WorkspaceManifest.model_validate(manifest(**changes))
