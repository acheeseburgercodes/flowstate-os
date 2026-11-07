import { test, expect } from "@playwright/test";

test('shared plan editing binds approval to the saved revision', async ({ page }) => {
  const token = process.env.FLOWSTATE_API_TOKEN;
  if (!token) throw new Error('Set FLOWSTATE_API_TOKEN');
  await page.goto('/settings');
  await page.getByLabel('Device token').fill(token);
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Connected to the workspace service');
  await page.getByRole('link', { name: 'Collaboration', exact: true }).click();
  await page.getByRole('button', { name: 'New shared plan' }).click();
  await page.getByLabel('Plan name').fill(`Shared test ${Date.now()}`);
  await page.getByLabel('Switch room ID').fill('fixture-room-not-live');
  await page.getByLabel('Resource URLs, one per line').fill('https://react.dev');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Approve revision 1' })).toBeEnabled();
  await page.getByLabel('Plan name').fill('Revised shared test');
  await expect(page.getByRole('button', { name: 'Approve revision 1' })).toBeDisabled();
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page.getByRole('button', { name: 'Approve revision 2' }).click();
  await expect(page.getByLabel('Plan name')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Publish approved plan to room' })).toBeVisible();
  await page.screenshot({ path: 'test-results/shared-plan.png', fullPage: true });
  // Deliberately do not click publish: this test never sends external room messages.
});

test("real API workspace round trip and graph selection", async ({ page }) => {
  const token = process.env.FLOWSTATE_API_TOKEN;
  if (!token)
    throw new Error(
      "Start the API and set FLOWSTATE_API_TOKEN for the E2E test",
    );
  const errors: string[] = [];
  const workspaceName = `E2E frontend development ${Date.now()}`;
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/settings");
  await page.getByLabel("Device token").fill(token);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Connected to the workspace service",
  );
  await page
    .getByRole("link", { name: "Command surface", exact: true })
    .click();
  await page.getByLabel("Workspace intent").fill(workspaceName);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(
    page.getByRole("heading", { name: workspaceName }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add URL" }).click();
  await page.getByLabel("Resource 1 URL").fill("https://react.dev");
  await page.getByRole("button", { name: "Save configuration" }).click();
  await expect(page.getByRole("status")).toHaveText("Configuration saved");
  await page
    .locator(".react-flow__node")
    .filter({ hasText: "https://react.dev" })
    .click();
  await expect(
    page.getByText("Selected resource: https://react.dev"),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/workspace.png", fullPage: true });
  await page
    .getByRole("link", { name: "Command surface", exact: true })
    .click();
  await page.getByRole("link", { name: new RegExp(workspaceName) }).click();
  await expect(page.getByLabel("Resource 1 URL")).toHaveValue(
    "https://react.dev/",
  );
  await page
    .getByRole("button", { name: "Delete workspace", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await expect(page.getByLabel("Workspace intent")).toBeVisible();
  await page.screenshot({ path: "test-results/home.png", fullPage: true });
  expect(errors).toEqual([]);
});
