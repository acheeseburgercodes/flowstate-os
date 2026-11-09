# FlowState OS

Team chat is where work gets discussed. Your desktop is where you open the project, find the right tabs, and put everything back in place. FlowState OS connects those two parts of the job.

It takes contributions from a Switch room and lets you assemble a workspace plan. You review the saved version, approve its actions on your Windows machine, and choose whether to send the result counts back to the room. It also saves window arrangements so you can restore matching windows later.

Built for the WeMakeDevs Flip the Switch hackathon with React, FastAPI, Tauri, and Switch.

The new animated product ad and interactive preview are described in [the motion demo guide](docs/motion-ad.md). With the web server running, open `http://127.0.0.1:5173/ad-preview.html` to watch, scrub, enable music, or switch to the actual live application.

## Open the application on the configured Windows laptop

The November 8 build launches on the configured laptop and opens Operations with API and Switch connected. An earlier unsigned build was blocked by Windows Application Control; no Windows security policy was changed. This remains an unsigned development build, so other machines may require an approved signing or allowlisting path.

Double-click **Launch FlowState.vbs** in this repository (or the FlowState OS desktop shortcut). The application opens immediately with an animated startup screen and logs. The launcher starts Docker Desktop, the existing Switch PostgreSQL database, Mattermost, Switch Core, and the FlowState API as needed, then waits for acknowledged room coverage. The desktop connects to its device token automatically and opens Operations. No development terminal or Vite server is needed.

This uses the Switch installation already configured by Switch Desktop under `%APPDATA%\switchdash\local-switch-server\native` and the ignored root `.env`. It is not a fresh-machine installer. First-time setup still requires the prerequisites and Switch configuration below. Codex must be installed and signed in (`codex login`); AI execution needs internet access. Existing services are reused and remain running when you close the app. Startup errors and service logs are under `%LOCALAPPDATA%\FlowState\startup`.

After source changes, rebuild the embedded application:

```powershell
pnpm --filter @flowstate/desktop exec tauri build --debug --no-bundle
```

In **Operations**, add tasks with Research, Code, or Review skills. Auto-route assigns enabled specialists by skill and queue size. Click **Run assigned queue**, or select a task and **Run assigned agent**. Two read-only Codex jobs can run concurrently; queue rows show actual execution status, and selecting a task shows its answer. On November 7, all three tasks in a live queue completed successfully.

Choose **Execution mode** before submitting. **Sandbox** is the default and uses Codex's read-only sandbox. **Full access** runs without that sandbox and can modify accessible files or run commands with your account's permissions. It requires a fresh confirmation for each task or queue submission; it does not grant administrator rights or disable Windows protections. Each job stores its original mode, including after a restart. November 8 verification completed three sandbox tasks and a full-access task that wrote and verified a designated test file.

The updated product film is attached to the repository's demo release: 39 seconds, 1080p/60 FPS, original instrumental music, no narration. It shows real interface captures, connected Switch status, agent results, both themes, and the permission controls.

## What to look for in the demo

The judging criteria are Switch usage (30%), technical execution (25%), creativity and impact (25%), and presentation (20%). Here is the evidence this project offers for each:

| Criterion | What FlowState does | Evidence and limits |
| --- | --- | --- |
| Use of Switch | Receives team contributions through a dedicated relay and publishes approved results to the original room. | Live Mattermost room coverage was verified. Without Switch, this collaboration path stops; local workspace tools still work. |
| Technical execution | React UI, FastAPI persistence, and a Tauri Windows companion with approval gates. | Embedded desktop build and 21 API tests pass. Automatic startup and live sandbox/full-access jobs verified. Discord live setup remains pending. |
| Creativity and impact | Takes a shared workspace plan from team chat to each person's locally approved setup, with saved window arrangements. | Intended to reduce repeated setup during shared coding or research sessions; no measured productivity claim. |
| Presentation | Music-only product advertisement using actual connected UI and completed agent results. | 1080p/60 FPS animated film; the film is edited product footage, not an uninterrupted chat-to-desktop execution recording. |

Motion includes page slides, viewport fade-ins, and button feedback, with reduced-motion support. The reveal component is adapted from Klyv UI through 21st.dev; see [third-party notices](THIRD_PARTY_NOTICES.md).

### Data flow

```mermaid
flowchart LR
  Human --> Chat[Discord or Mattermost]
  Chat <--> Switch[Switch room]
  Switch <--> Agent[Codex agent]
  Switch <--> Relay[FlowState relay]
  Relay <--> API[FlowState FastAPI]
  API --> Approval[Local approval]
  Approval --> Desktop[Tauri companion]
  Desktop --> Windows[Windows capabilities]
  Desktop --> Results[Verified results]
  Results --> API
  API --> Relay
```

Switch handles the rooms and routes messages between people and agents. The separate FlowState relay brings room contributions into the app. FlowState handles saved plans and local approval. Reading a chat message does not grant permission to control your desktop.

## Hackathon status

The Operations page lets you create specialist profiles, assign tasks, auto-route by explicit skill and current queue size, and inspect assignment reasons. Assignments persist in this browser. After connecting in Settings, **Run assigned agent** submits an authenticated Codex job to the API host. Jobs persist in the database, use the selected permission mode and a 180-second timeout, and expose their actual answer or failure. Two jobs can run concurrently. Marking an assignment reviewed remains a human planning action, separate from execution. This runner is not yet integrated with Switch's agent controller or deployed to a remote server.

The interface includes TempVault-inspired warm dark and cream/violet light themes, an animated theme transition, task-entry animations, and scroll reveals. Reduced-motion preferences disable movement.

On November 7, the relay connected to Switch Core 0.31.0 and a real Mattermost room. Authentication, discovery of 57 operations, and WebSocket room coverage passed. A separate Codex identity is registered; a complete conversation with its running agent still needs to be demonstrated.

Mattermost and Discord can be used in the same build through separate Switch rooms. The inbox can filter by room, and plans publish results back to their own room. Mattermost is connected on the development machine. Discord support is implemented and covered by adapter tests, but its bot bridge has not been configured or tested live here.

The embedded desktop build, 21 backend tests, and 3 frontend tests pass. The previous native run passed 10 tests; one optional launch fixture test was ignored. Full multi-person chat-to-desktop execution is not claimed as verified. See the [submission brief](docs/hackathon-submission.md), [demo runbook](docs/demo.md), and [Switch setup](docs/switch-setup.md).

## Run on Windows

Requirements: Node 22+, pnpm 11+, uv, Python 3.12+, Rust and MSVC build tools, Windows WebView2 for the desktop shell.

```powershell
pnpm install
cd services/api
uv sync --python 3.12 --group dev
cd ../..
./scripts/start-api.ps1
```

The API script loads the ignored root `.env` when present, generates an ephemeral session token when none is set, applies migrations, and binds to loopback. Keep that terminal open. In another terminal:

```powershell
pnpm dev
# Or run the desktop shell (do not also run the web dev server):
pnpm --filter @flowstate/desktop dev
```

Open http://127.0.0.1:5173 for the web portal. Enter the API token in Settings. Create a workspace, add URLs, save, and reopen it from Resume. In the desktop shell, Local windows → Allow window discovery reads visible windows every five seconds until stopped. Window titles are not uploaded to the API.

SQLite is the local development default. For PostgreSQL, set `POSTGRES_PASSWORD`, run `docker compose up -d`, and set `FLOWSTATE_DATABASE_URL` to a `postgresql+psycopg://` connection URL before migrations. Docker Desktop and Linux containers were verified on the demo host; Switch's local Mattermost service is running in Docker.

## Verify

```powershell
pnpm build
pnpm test
cd services/api
.venv/Scripts/python.exe -m pytest -q
.venv/Scripts/ruff.exe check app tests migrations
cd ../../apps/desktop/src-tauri
cargo test --features custom-protocol
cargo build
```

For the real browser/API workflow, start the API with `FLOWSTATE_API_TOKEN` set in your environment. In a terminal with the same token:

```powershell
pnpm --filter @flowstate/web exec playwright install chromium
pnpm --filter @flowstate/web exec playwright test
```

The test creates a workspace through the UI, edits resources, selects a graph node, revisits the saved configuration, and deletes the test workspace. Screenshots go to `apps/web/test-results`.

## Current limitations

- Command-surface intent text creates a named draft. AI specialist execution is available separately in Operations; it does not automatically generate a workspace plan.
- The resource graph represents configuration, not live OS window positions.
- Native discovery reads titles, process IDs, process start time, handles, bounds, minimized/maximized state, and monitor work areas. Executable paths for discovered windows and native event subscriptions are not implemented. Trusted applications are selected with a native picker, stored with SHA-256 hashes, and rechecked before an approved launch. An application update requires re-registration.
- Time Machine captures selected windows into local SQLite. Preview and restore support normal windows whose handle, process ID, process start time, and title still match. Native approval is required, and a pre-restore snapshot enables a separately approved rollback attempt. Bounds are verified after each operation. Closed, renamed, elevated, inaccessible, minimized, and maximized windows are not restored. Version 2 snapshots use per-monitor DPI coordinates and record monitor work areas; incompatible display geometry and legacy snapshots are refused. Mixed-DPI hardware changes still need interactive validation.
- Collaboration receives addressed Switch messages from the live configured room, associates contributions with portable drafts, enforces revision-bound decisions, and can explicitly publish an approved plan. A failed publication has an unknown outcome and cannot automatically retry. The two-human message/publication walkthrough still requires interactive demo participants.
- Approved shared plans can request up to 20 native app-launch, URL-open, or authorized VS Code project-folder actions. A native dialog confirms exact actions; results persist locally and stream to the UI. Execution IDs prevent replay, cancellation stops remaining actions, and interrupted work is never automatically retried. Browser acceptance is not a verified tab load. Users can explicitly publish result counts to the room without local paths or window titles. Project cloning and automatic matching of newly opened windows remain pending.
- Local windows offers focus, split, coding, research, presentation, and triple layouts on a selected monitor, with preview, native confirmation, rollback capture, and bounds verification. Select normal windows manually after launching applications.
- Activity shows local plan execution results. External OAuth connectors, browser extension, and FlowBar are not implemented.
- Authentication is a single-device development token held in UI memory. Multi-user identity, OS credential storage, granular permissions, audit persistence, and production deployment are pending.

See [security notes](docs/security.md) for the current trust boundaries.
