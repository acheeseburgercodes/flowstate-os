import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

// Records the real web interface. Captions explain capabilities and verification limits.
await mkdir('test-results/video', { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, recordVideo: { dir: 'test-results/video', size: { width: 1440, height: 1000 } } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.goto('http://127.0.0.1:5173');
const scenes = [
  ['/', 'FlowState OS', 'A team discusses work in Switch. FlowState turns room contributions into a workspace plan you review and approve locally.'],
  ['/collaboration', 'Switch is the collaboration layer · 30%', 'A dedicated relay receives room contributions. Mattermost connectivity was verified. Discord support is implemented; its live bot connection is still pending.'],
  ['/settings', 'Reproducible local setup · 25%', 'Run Switch and Mattermost, configure the relay and room IDs, then start the FastAPI service and desktop companion. A session token connects this UI to your local service.'],
  ['/desktop', 'A practical team workflow · 25%', 'The Windows companion can inspect and arrange selected windows. The web portal shown here cannot execute native actions. Local confirmation is required on the desktop.'],
  ['/timeline', 'Save an arrangement, then restore it', 'Time Machine captures selected windows locally. Restore applies to matching, still-running normal windows; it does not reopen closed applications.'],
  ['/integrations', 'Approve the exact actions', 'Register trusted applications in the desktop companion. Shared plans bind approval to a saved revision. Messages from chat do not silently control the computer.'],
  ['/activity', 'Close the loop in the original room', 'Execution results are stored locally. Users can explicitly publish result counts to the plan’s Switch room without sharing local paths or window titles.'],
  ['/', 'What is verified, and what comes next', 'Web build and 17 API tests pass. This is a UI walkthrough, not a recorded end-to-end agent demo. Record a real agent response and approved execution before submitting.'],
];
for (const [route, title, text] of scenes) {
  if (route !== new URL(page.url()).pathname) await page.locator(`nav a[href="${route}"]`).click();
  await page.waitForTimeout(900);
  await page.evaluate(({ title, text }) => {
    document.getElementById('recording-caption')?.remove();
    const card = document.createElement('div'); card.id = 'recording-caption';
    card.style.cssText = 'position:fixed;bottom:32px;left:272px;right:32px;padding:24px 30px;background:#142025f5;border:1px solid #5f858d;border-radius:14px;color:#eef5f6;font:20px/1.6 Arial,sans-serif;z-index:9999;box-shadow:0 12px 40px #0008;pointer-events:none';
    const heading = document.createElement('strong'); heading.textContent = title; heading.style.cssText = 'display:block;font-size:26px;color:#a5cbd3;margin-bottom:8px';
    const body = document.createElement('div'); body.textContent = text;
    card.append(heading, body); document.body.append(card);
  }, { title, text });
  await page.waitForTimeout(11000);
}
await page.screenshot({ path: 'test-results/video/final-preview.png' });
const video = page.video();
await context.close();
await video.saveAs('test-results/video/flowstate-walkthrough.webm');
await browser.close();
if (errors.length) throw new Error(errors.join('\n'));
console.log('Recorded real UI walkthrough: test-results/video/flowstate-walkthrough.webm');
