# Current trust boundaries

All workspace endpoints require a configured random bearer token. The API refuses to start with a token shorter than 32 characters. Tokens are never stored in frontend localStorage. Health and OpenAPI are public and contain no workspace data.

The development API binds to loopback, validates Host headers, and rejects unknown Origin headers. This is a single-user development configuration; do not expose it on a public interface. The Vite proxy is also bound to loopback.

The Tauri shell exposes discovery and specific snapshot commands. There is no renderer shell execution, generic filesystem API, or remote privileged action endpoint. Discovery starts with an explicit UI gesture and stops on navigation or revocation. Selected snapshots are stored unencrypted in the app-local SQLite database, never sent to the backend. Restore loads stored bounds by snapshot ID and requires a native confirmation dialog, defaulting to No. It checks window handle, PID, process creation time, and title, rejects elevated processes and unsupported states, and verifies actual bounds. Only one restore can run at a time. Identity checks cannot eliminate every race with a concurrently closing or recycled native window.

Shared resources accept HTTP(S) URLs and reject embedded username/password credentials. This does not detect secrets in URL queries: users must not paste tokenized private links into shared manifests. No manifests are published to a room in the current version.

Not production ready: persistent device identity, OS-protected credential storage, per-capability grants, rate limiting, request size limits, detailed audit events, user ownership, and the remote execution approval pipeline remain outstanding. Local workspace data is stored unencrypted in the development database.
