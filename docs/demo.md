# Live demo runbook

This is a verification procedure, not evidence that a live demo has passed. Use a real Switch room and two participants; do not substitute test fixtures.

1. Follow [Switch setup](switch-setup.md) with your actual server URL, relay agent ID, room ID, and locally entered API key. Start the API and desktop companion using the root README.
2. Enter the local API token in Settings. In Collaboration, connect the configured room and wait for acknowledged coverage. Verify one addressed message from each participant appears once. Stop if coverage is absent or history is incomplete.
3. Select the contributions and compose a portable plan with the intended room, name, layout, and resource URLs. Inspect the manifest. Save an edit and verify the revision increments. Approve only the current saved revision. Explicitly publish it to the room and verify receipt there.
4. In Integrations, register a trusted application using the native executable picker. For project opening, register Code.exe. In the approved plan, authorize an existing local project folder and choose that registered VS Code application. Folder paths stay local; repository cloning is not supported.
5. Request local execution. Review the native confirmation containing exact URLs, executables, and project folder. Cancel first to verify that no actions run; use a fresh execution after reopening the plan. Approve only the intended actions. Inspect per-action results and verify the actual applications/pages separately; accepted requests do not prove readiness.
6. In Local windows, enable discovery and select the required number of normal windows. Choose a monitor and layout, inspect the preview, and approve arrangement. Verify bounds results. In Time Machine, inspect and restore the automatic pre-arrangement snapshot with a second native approval. Protected, closed, renamed, and minimized/maximized windows are outside this restore scope.
7. Return to the execution result and explicitly publish its counts. Confirm the room message contains only plan/revision/execution identifiers, state, and counts. If publication is unknown, inspect the room manually; the client must not automatically resend.
8. Have the second participant confirm the shared result. Record the observed outcomes and remaining failures. A full demo also requires an independently configured Codex agent in Switch; FlowState does not install or impersonate that agent.

## Remaining release gates

- Live room connectivity, Codex participation, and two-human contribution flow.
- Native approval UI, browser dispatch, VS Code project opening, and mixed-DPI layout/rollback checks on the target machine.
- Windows installer/signing and production identity/secret storage.
- Optional browser companion, OAuth connectors, and FlowBar remain in the completion queue after the core demo.

Never disable Windows Application Control to run a demo. A blocked executable is a real failed action and should remain visible.
