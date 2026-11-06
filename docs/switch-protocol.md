# Switch protocol research

Source read on 2026-11-06: https://docs.switchagents.ai/switch-rooms/internals/agent-protocol.md

The released protocol uses a WebSocket for room events and HTTP operations. SSE is deprecated. The bridge base URL is the server address; `GET /health` is its public health probe. Every privileged request uses the agent API key as a bearer credential, separate from registration credentials.

The implementation must discover `GET /agents/{agent_id}/ops`, whose `operations` map contains descriptions and input schemas. Calls use `POST /agents/{agent_id}/ops/{operation}` with unwrapped arguments and an optional `X-Switch-Connection-Id` header. Some operations require the connection to resolve a room.

Before implementing event consumption, read the linked agent-connection and agent-events specifications. Persist the connection UUID across reconnects, use server-provided room claims and cursor, retain generation, respond to ping, and act only on messages with `payload.addressed = true`. Registration is an explicit one-time setup action, not a startup action.

There is no separate Switch task protocol: agents coordinate through messages. FlowState task IDs and manifests belong to FlowState and must be correlated with room messages. Remote messages remain proposals until local approval.

No live Switch instance, agent API key, room membership, operation discovery response, or MCP tool registry has yet been verified for this project. This document is research, not evidence of a working integration.
