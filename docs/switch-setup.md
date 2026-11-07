# Connect a real Switch room

## Mattermost and Discord together

Connect both collaboration bridges in Switch Console. For Discord, configure your Discord bot through Console's Discord setup and install it into your intended Discord server. Create one Switch room attached to Mattermost and another attached to the intended Discord channel. Add the dedicated FlowState relay to both rooms and authorize the intended participants in Switch addressing settings.

Set `SWITCH_ROOM_ID` to the Mattermost room ID and `SWITCH_ADDITIONAL_ROOM_IDS` to the Discord Switch room ID (comma-separated for more rooms), then restart the API and connect from Collaboration. Use Switch room IDs, not Discord channel IDs. The relay uses Switch's all-room connection scope when multiple rooms are configured, filters ingestion to the configured allowlist, and publishes plans and reports only to their bound room. The inbox selector filters contributions by room. No messages are automatically mirrored between platforms.

The local Mattermost bridge is verified. A Discord bridge and Discord message delivery have not yet been configured or verified on this host.

The adapter implements the documented Agent Bridge WebSocket and HTTP operation interfaces. In addition to contract tests, the local setup was live-verified on 2026-11-07 against Switch Core 0.31.0 and a Mattermost-backed room. It discovered 57 operations, claimed the configured room, and reached `connected` without a history gap.

1. Install Switch Console and follow the official quickstart: https://docs.switchagents.ai/switch-rooms/getting-started/index.md. Start Docker Desktop first. The verified local stack uses Switch Core on loopback and Switch-managed Mattermost in a Docker Linux container.
2. Create a room attached to Mattermost or Discord. Add the two participants and a Codex agent through Switch Console.
3. Register a separate custom agent for the FlowState relay using the official procedure: https://docs.switchagents.ai/switch-rooms/internals/agent-protocol.md. Do not reuse the Codex agent API key: controller-managed agents cannot open this connection, and competing connections can take room claims away from each other.
4. Authorize the intended participants in that relay agent's addressing settings and add it to the demo room. Retain the agent ID and its API key. Registration happens once, outside the FlowState API; never put the key into Git or chat.
5. Set these environment variables in the terminal used to start the API:

```powershell
$env:SWITCH_BASE_URL = 'https://your-switch-server.example'
$env:SWITCH_AGENT_ID = 'your-relay-agent-id'
$env:SWITCH_ROOM_ID = 'your-room-id'
# Read the API key without echoing it. It remains in this process environment.
$switchSecret = Read-Host 'Switch relay API key' -AsSecureString
$env:SWITCH_AGENT_API_KEY = [System.Net.NetworkCredential]::new('', $switchSecret).Password
./scripts/start-api.ps1
```

The example host is a placeholder; use your server's actual address. HTTP is permitted only for loopback. `.env.example` is a reference. The startup script loads an ignored root `.env` if present, while process-level variables take precedence.

6. Connect the frontend to the FlowState API in Settings. Open Collaboration and select **Connect configured room**. This explicitly claims the configured room for the relay. The UI reports connected only after Switch acknowledges coverage in its connection state.
7. Address the relay in the actual team room. The message should appear in FlowState's inbox once, even if Switch replays it after reconnect. A received request is inert: no OS action runs.

The adapter stops on takeover, terminal eviction, authorization refusal, or malformed frames. Recoverable transport failures back off to 30 seconds. A history gap remains visible and prevents assuming complete context. No automated replies or write retries are performed by the inbox checkpoint.

Manifest review, revision-bound approval, local execution, and explicitly authorized result-count publication are implemented. Follow [the demo runbook](demo.md) for the interactive two-human walkthrough. Server, relay, room membership, operation discovery, and WebSocket room coverage have been live-verified.
