import asyncio
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest

from app.switch_adapter import SwitchClient, SwitchConfig, SwitchError


def test_multiple_rooms_use_all_scope_and_restrict_publication():
    sent = []

    def handler(request):
        sent.append(request.content)
        return httpx.Response(200, json={})

    async def exercise():
        client = SwitchClient(
            SwitchConfig(
                "http://127.0.0.1:52921", "relay", "secret", "mattermost", ("discord",)
            ),
            transport=httpx.MockTransport(handler),
        )
        query = parse_qs(urlsplit(client.websocket_url("connection", None, None)).query)
        assert query["scope"] == ["all"]
        assert query["rooms"] == ["mattermost,discord"]
        await client.publish_message("mattermost", "first")
        await client.publish_message("discord", "second")
        with pytest.raises(SwitchError):
            await client.publish_message("unapproved", "blocked")
        assert len(sent) == 2
        assert b'"room_id":"discord"' in sent[1]
        await client.close()

    asyncio.run(exercise())
