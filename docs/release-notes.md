# FlowState OS — permissions and product demo

Operations now supports Sandbox (read-only, default) and Full access for authenticated agent jobs. Full access requires confirmation for each task or queue submission and can edit accessible files and execute commands under the current account. Job permissions persist across restarts.

The attached 39-second product film is rendered at 1920×1080, 60 FPS, with original instrumental music and no narration. It uses actual interface captures with animated pans and transitions, not an uninterrupted workflow recording.

Verified: embedded desktop build, connected native Operations page, automatic local service startup, 21 backend tests, 3 frontend tests, three live sandbox jobs, and a full-access job writing its designated test file.

Run from the configured checkout using Launch FlowState.vbs. The existing Switch installation, root .env, Docker, and signed-in Codex runtime are prerequisites. The executable remains unsigned. Live Discord bridge setup and the full multi-person Switch-to-native-action demo remain unverified; local Codex jobs are not managed by Switch's controller.
