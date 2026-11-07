# Implementation checklist

## Verified environment

- Empty starting workspace; no existing source or repository instructions.
- Node 24.18.0 and pnpm 11.25.0 available.
- Rust and Cargo 1.97.1 available.
- Default Python is 3.10.4; API requires a managed Python 3.12+ environment.
- Docker is not on PATH. PostgreSQL and Switch runtime availability remain unverified.

## Incremental delivery

- [x] Inspect workspace and read complete specification.
- [x] Read official Switch README and documentation index.
- [ ] Inspect released Switch Agent Bridge protocol and MCP schemas.
- [x] Bootstrap strict React/Vite frontend and FastAPI service.
- [x] Add workspace persistence, migration, development token authentication, workspace CRUD. Production device identity remains pending.
- [x] Build Tauri shell and read-only Windows enumeration.
- [ ] Add native approval, registered applications, validated layouts.
- [x] Capture selected windows locally and restore matching normal windows with native confirmation, rollback snapshot, and per-window results. Full application/session restoration remains pending.
- [ ] Connect actual Switch instance and Codex runtime.
- [ ] Exercise two-human room contribution and local execution workflow.
- [ ] Add browser companion and independently testable service connectors.
- [ ] Build FlowBar, keyboard navigation, and reduced-motion behavior.
- [ ] Run frontend, backend, native, and end-to-end checks.
- [ ] Complete security, installation, demo, and submission documentation.

## Risks and boundaries

Switch connectivity requires a running instance, a registered agent, and an authorized room. Never mark connection healthy from configuration alone. Native operations require real Windows verification. Elevated or protected windows can fail. OAuth integrations require provider configuration and user consent. Browser snapshots restore supported URLs, not arbitrary browser state. Missing prerequisites must remain visible, not be replaced with simulated success.

## Verification, 2026-11-06

- Seven backend tests pass: portable schema rejection, authorization, origin/host checks, CRUD, and persisted state across app instances.
- Three frontend validation tests pass.
- One Playwright workflow passes against the live API, including graph selection, save/reopen, and deletion.
- Four native tests pass: Win32 enumeration, actual move-and-restore of a disposable test-owned window, SQLite persistence/deletion, and invalid empty snapshot rejection. Native approval dialog and full interactive restore workflow still need UI verification.
- Frontend production build and Rust desktop debug build pass.
- Tauri packaged debug build with embedded frontend passes (`tauri build --debug --no-bundle`); executable is under `apps/desktop/src-tauri/target/debug/flowstate-desktop.exe`. Installer and interactive desktop UI verification remain pending.
- SQLite migration applied successfully; Ruff check passes.
- Screenshot review completed for home and workspace pages.
- Switch workflow, PostgreSQL, OAuth, full session restoration, and application launching remain outstanding.

## Additional verification, 2026-11-07

- 15 backend tests pass, including Switch protocol fixtures, durable deduplication, revision-bound approval, and uncertain publication without retry.
- 3 frontend unit tests and 2 real API/browser workflows pass. The shared-plan browser test deliberately does not publish externally.
- 8 native tests pass with the compiled launch fixture enabled, including an actual process launch and rejection after executable modification.
- Web production build passes. Native plan executor compiles and validates finite actions; its complete interactive approval and browser-dispatch flow still needs live UI verification.
- Persistent work queue: `docs/work-queue.md`. Live Switch server URL and room ID requested; user confirmed they will provide them. No server credentials are in the repository.

## Official research sources

- https://github.com/sandbox-quantum/switch
- https://docs.switchagents.ai/llms.txt
- https://docs.switchagents.ai/mcp
- https://www.wemakedevs.org/hackathons/switch
- https://react.dev/learn/build-a-react-app-from-scratch
- https://tauri.app/start/

## UI direction

Calm, exact, instrument-like. Graphite surfaces, silver-blue selection, semantic status colors. The live topology and snapshot timeline carry visual detail. A thin execution trace connects proposed actions, human decisions, and verified results. No fabricated activity or connection data.
