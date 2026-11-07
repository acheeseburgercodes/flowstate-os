# Completion queue

Updated 2026-11-07. Work proceeds in dependency order in the current chat. Each verified checkpoint is committed and pushed to origin/main. This file is a persistent backlog, not a claim that unattended jobs are scheduled.

| Order | Work | Completion evidence | State |
| --- | --- | --- | --- |
| 1 | Switch adapter: health, operation discovery, event ingestion, reconnect and deduplication | 6 contract tests plus live Switch 0.31.0 connection; 57 operations discovered, configured room covered, no history gap | Implemented and live-connected |
| 2 | Shared manifests, room binding, edit/review/approval, safe status publication | API and browser revision/approval tests pass; live publication pending credentials | Implemented |
| 3 | Trusted local app registration and launch, approved URL opening | Actual registered fixture launch and binary-change rejection pass; URL validation tested, live browser dispatch pending UI check | Implemented with verification limits |
| 4 | Resolve approved shared resources locally and execute finite plans | Native confirmation, persistent results, progress, cancellation, authorized VS Code folders, privacy-limited room reporting; live workflow pending | Implemented, interactive verification pending |
| 5 | Display-aware layouts and richer snapshots | Monitor work areas, physical coordinates, layout preview, rollback, versioned snapshot compatibility; mixed-DPI interactive test pending | Implemented with verification limits |
| 6 | Codex through Switch and two-human demo | Mattermost room and separate relay/Codex identities created; actual two-human contributions, approval, execution, and report remain | Infrastructure ready; interactive walkthrough pending |
| 7 | Browser companion, service connection flows, FlowBar | Independently verified capabilities; explicit unsupported-state labels | Queued after core demo |
| 8 | Full validation, installer, documentation and submission materials | Web build and 16 API + 3 UI tests pass in the current checkout; submission brief and demo script are available. Installer/signing, demo video URL, and final form submission remain pending | Partially complete |

Do not replace the real Switch demo with mock events. Contract fixtures prove adapter logic only. Do not expand optional integrations until the core demo is working.
