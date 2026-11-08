# WeMakeDevs Switch hackathon submission brief

## Project

**FlowState OS — turn team intent into an approved, restorable workspace**

FlowState OS lets people and agents collaborate in a Switch room, shape the conversation into a portable workspace plan, and execute that plan on Windows only after a local, revision-bound approval. It separates team coordination from operating-system authority: remote messages can propose work, but they cannot silently launch applications, open URLs, or move windows.

Repository: https://github.com/acheeseburgercodes/flowstate-os

## Why Switch is central

Switch routes the team conversation into FlowState through a dedicated relay. The local setup has a real Mattermost room and a separate registered Codex identity. FlowState discovers the server's operations, filters messages to configured rooms, deduplicates replayed messages, and keeps track of missing history. Plans and reports go back to their original room. If delivery is uncertain, the app does not automatically resend.

Mattermost and Discord belong in this single project submission. Both use Switch rooms. Mattermost connectivity is verified; the Discord adapter path is implemented, but the Discord bot bridge and live delivery remain unverified.

## Current video and verified behavior

The final product advertisement is `apps/web/test-results/product/FlowState-OS-product-film.mp4`: 1080p, 60 FPS, original upbeat instrumental music, no narration. It uses actual UI captures, acknowledged Switch connectivity, and a queue whose three real specialist jobs completed. The edit uses animated pans and transitions; it is not an uninterrupted end-to-end recording.

Double-click `Launch FlowState.vbs` on the configured laptop. Startup waits for Docker, the Switch database, Mattermost, Switch Core, the API, and room coverage, with visible stages and logs. The desktop includes its own built UI. AI calls use the signed-in local Codex runtime and need internet access.

The remaining gaps are live Discord bridge setup and the full multi-person Switch-to-native-action demonstration. Local Codex jobs are independent of Switch's controller; do not describe them as controller-managed agents.

November 8 verification: the rebuilt desktop launches and opens Operations with API and Switch connected. No Windows security policy was changed. The latest source builds; 21 API and 3 web tests pass, and the previous native test run passed 10 tests with one fixture ignored. Sandbox is the default. Full access requires explicit per-run confirmation and retains its mode in job history. Three real sandbox tasks completed; a full-access task wrote and verified a designated test file. This is still an unsigned development build, not a signed installer.

## Extended demo flow

This is the intended walkthrough, not a claim that the complete live demo has passed. Record only steps you have actually completed, including a real agent response.

1. Two people and Codex contribute in the Switch room.
2. FlowState receives addressed room messages exactly once and treats them as inert proposals.
3. A participant assembles a portable plan; every edit creates a new revision.
4. Approval binds to the exact saved revision.
5. The desktop companion shows the exact URLs, executables, project folder, and window actions in a native confirmation.
6. FlowState executes only the approved finite action list, records per-action results, and can restore a captured window layout.
7. A participant explicitly publishes privacy-limited result counts to Switch; local paths and window titles stay on the device.

## Reproducibility

- Windows 11, Docker Desktop with WSL 2, Node 22+, pnpm 11+, Python 3.12+, uv, Rust/MSVC, and WebView2.
- Follow `docs/switch-setup.md`, then use the commands in the root README.
- Verified locally on 2026-11-07 with Switch Core 0.31.0, Switch-managed Mattermost, 57 discovered operations, acknowledged room coverage, and no history gap.
- Current automated evidence: embedded desktop build, 21 API tests and 3 frontend tests pass. Earlier verification passed 10 native tests. Native limitations are documented.

## Three-minute demo script

**0:00–0:25 — Problem and trust boundary.** Show the Switch room and explain that chat can propose actions but cannot directly control Windows.

**0:25–0:55 — Live Switch connection.** Show both FlowState agents in `flowstate-demo`, open Collaboration, connect the configured room, and point out connected status, room coverage, and history-gap state.

**0:55–1:25 — Collaborative plan.** Send one contribution from each participant and one Codex response. Select the contributions, create the plan, edit it, and show the revision increment.

**1:25–2:10 — Safe local execution.** Approve the current revision, request execution, show the native confirmation with exact actions, then approve. Show the opened resources and arranged windows.

**2:10–2:35 — Restore and audit.** Open Time Machine, show the automatic pre-action snapshot, restore it with a second approval, and show Activity results.

**2:35–3:00 — Close the loop.** Explicitly publish result counts to Switch and show that the message contains identifiers and counts, not private paths or window titles. End on the architecture diagram and repository URL.

## Before pressing Submit

- Replace this checklist item with the public demo-video URL.
- Confirm the GitHub repository is public and the default branch contains the live-verification documentation.
- Run the interactive two-human demo once and record any limitation honestly.
- Copy the project title and summary above into the submission form.
- Do not include `.env`, Switch API keys, local database files, logs, or machine-specific paths in the submission.
