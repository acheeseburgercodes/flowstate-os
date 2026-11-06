# FlowState OS

Your workspace, shaped by your intent.

Implementation is in progress. Workspace CRUD, the web portal, and read-only Windows enumeration are implemented. Switch, privileged OS actions, snapshots, and OAuth are not yet implemented. See [the implementation checklist](docs/implementation.md).

## Architecture

```mermaid
flowchart LR
  Human --> Chat[Discord or Mattermost]
  Chat <--> Switch[Switch room]
  Switch <--> Agent[Codex agent]
  Agent --> API[FlowState FastAPI]
  API --> Approval[Local approval]
  Approval --> Desktop[Tauri companion]
  Desktop --> Windows[Windows capabilities]
  Desktop --> Results[Verified results]
  Results --> API
  API --> Agent
```

Switch owns rooms, message routing, and human-agent collaboration. FlowState owns portable manifests, workspace state, local approval, and constrained OS execution. Remote messages must never invoke OS actions directly.

## Development status

This is a runnable foundation, not yet the complete hackathon MVP.

## Run on Windows

Requirements: Node 22+, pnpm 11+, uv, Python 3.12+, Rust and MSVC build tools, Windows WebView2 for the desktop shell.

```powershell
pnpm install
cd services/api
uv sync --python 3.12 --group dev
cd ../..
./scripts/start-api.ps1
```

The API script generates an ephemeral session token when none is set, applies migrations, and binds to loopback. Keep that terminal open. In another terminal:

```powershell
pnpm dev
# Or run the desktop shell (do not also run the web dev server):
pnpm --filter @flowstate/desktop dev
```

Open http://127.0.0.1:5173 for the web portal. Enter the API token in Settings. Create a workspace, add URLs, save, and reopen it from Resume. In the desktop shell, Local windows → Allow window discovery reads visible windows every five seconds until stopped. Window titles are not uploaded to the API.

SQLite is the local development default. For PostgreSQL, set `POSTGRES_PASSWORD`, run `docker compose up -d`, and set `FLOWSTATE_DATABASE_URL` to a `postgresql+psycopg://` connection URL before migrations. PostgreSQL/Compose has not been run on this host because Docker is unavailable.

## Verify

```powershell
pnpm build
pnpm test
cd services/api
.venv/Scripts/python.exe -m pytest -q
.venv/Scripts/ruff.exe check app tests migrations
cd ../../apps/desktop/src-tauri
cargo test
cargo build
```

For the real browser/API workflow, start the API with `FLOWSTATE_API_TOKEN` set in your environment. In a terminal with the same token:

```powershell
pnpm --filter @flowstate/web exec playwright install chromium
pnpm --filter @flowstate/web exec playwright test
```

The test creates a workspace through the UI, edits resources, selects a graph node, revisits the saved configuration, and deletes the test workspace. Screenshots go to `apps/web/test-results`.

## Current limitations

- Intent text creates a named draft; there is no connected model or intent planner.
- The resource graph represents configuration, not live OS window positions.
- Native discovery reads titles, process IDs, handles, bounds, and minimized/maximized state. Executable paths, monitor metadata, native events, window mutation, and launching are not implemented.
- Time Machine, collaboration, integrations, and activity routes explain their unavailable state. They do not simulate results.
- Authentication is a single-device development token held in UI memory. Multi-user identity, OS credential storage, granular permissions, audit persistence, and production deployment are pending.
- Tailwind, shadcn/Radix, and Motion are not yet integrated; styling currently uses shared CSS tokens. The UI follows the supplied palette and the unslop craft guidance.

See [security notes](docs/security.md) for the current trust boundaries.
