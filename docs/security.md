# Current trust boundaries

All workspace endpoints require a configured random bearer token. The API refuses to start with a token shorter than 32 characters. Tokens are never stored in frontend localStorage. Health and OpenAPI are public and contain no workspace data.

The development API binds to loopback, validates Host headers, and rejects unknown Origin headers. This is a single-user development configuration; do not expose it on a public interface. The Vite proxy is also bound to loopback.

The Tauri shell exposes one read-only discovery command. There is no renderer shell execution, generic filesystem API, or remote privileged action endpoint. Discovery starts with an explicit UI gesture and stops on navigation or revocation. Native data remains in frontend session memory and is not sent to the backend. Window discovery is not a proof of authorization to move those windows.

Shared resources accept HTTP(S) URLs and reject embedded username/password credentials. This does not detect secrets in URL queries: users must not paste tokenized private links into shared manifests. No manifests are published to a room in the current version.

Not production ready: persistent device identity, OS-protected credential storage, per-capability grants, rate limiting, request size limits, detailed audit events, user ownership, and the remote execution approval pipeline remain outstanding. Local workspace data is stored unencrypted in the development database.
