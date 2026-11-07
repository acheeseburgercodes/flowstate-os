# Connect a real Switch room

The adapter implements the documented Agent Bridge WebSocket and HTTP operation interfaces. Its contract tests use fixtures; no live Switch server has been verified on this machine.

1. Install Switch Console and follow the official quickstart: https://docs.switchagents.ai/switch-rooms/getting-started/index.md. Docker is not installed on this development host; use an existing server or install the supported local prerequisites through Console.
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

The example host is a placeholder; use your server's actual address. HTTP is permitted only for loopback. `.env.example` is a reference; the startup script does not automatically load `.env` files.

6. Connect the frontend to the FlowState API in Settings. Open Collaboration and select **Connect configured room**. This explicitly claims the configured room for the relay. The UI reports connected only after Switch acknowledges coverage in its connection state.
7. Address the relay in the actual team room. The message should appear in FlowState's inbox once, even if Switch replays it after reconnect. A received request is inert: no OS action runs.

The adapter stops on takeover, terminal eviction, authorization refusal, or malformed frames. Recoverable transport failures back off to 30 seconds. A history gap remains visible and prevents assuming complete context. No automated replies or write retries are performed by the inbox checkpoint.

Next checkpoints add manifest review, local execution, and explicitly authorized result publication. Do not present the current inbox as the complete hackathon scenario.
