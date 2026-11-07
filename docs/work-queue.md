# Completion queue

Updated 2026-11-07. Work proceeds in dependency order in the current chat. Each verified checkpoint is committed and pushed to origin/main. This file is a persistent backlog, not a claim that unattended jobs are scheduled.

| Order | Work | Completion evidence | State |
| --- | --- | --- | --- |
| 1 | Switch adapter: health, operation discovery, event ingestion, reconnect and deduplication | 6 contract tests pass; live server check still requires setup | Implemented, live verification pending |
| 2 | Shared manifests, room binding, edit/review/approval, safe status publication | API and browser revision/approval tests pass; live publication pending credentials | Implemented |
| 3 | Trusted local app registration and launch, approved URL opening | Actual registered fixture launch and binary-change rejection pass; URL validation tested, live browser dispatch pending UI check | Implemented with verification limits |
| 4 | Resolve approved shared resources locally and execute finite plans | Native confirmation, persistent results, progress and cancellation implemented for app launch/URL open; project mapping and room result reporting pending | In progress |
| 5 | Display-aware layouts and richer snapshots | Monitor coordinate tests; real window arrangement and rollback | Queued |
| 6 | Codex through Switch and two-human demo | Actual room request, contributions, approval, execution, report | Needs Switch instance and participants |
| 7 | Browser companion, service connection flows, FlowBar | Independently verified capabilities; explicit unsupported-state labels | Queued after core demo |
| 8 | Full validation, installer, documentation and submission materials | Build/test evidence, reproducible demo instructions, pushed checkpoint | Queued |

Do not replace the real Switch demo with mock events. Contract fixtures prove adapter logic only. Do not expand optional integrations until the core demo is working.
