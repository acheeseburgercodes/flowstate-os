# Animated product advertisement

The new 36-second film replaces the earlier slide-style edit with animated typography, moving interface panels, particles, specialist cards, a circular dark/light reveal, and real task-entry footage. The final composition is rendered frame by frame at 1920×1080 and 60 FPS. The embedded browser recording retains its original capture cadence. The original instrumental score has no narration.

## Live previews

With the web development server running, open `http://127.0.0.1:5173/ad-preview.html`. Use the playback controls to pause, scrub, or enable music. **Live application** opens the actual local application in the same page; this is separate from the edited advertisement. Agent execution still requires the normal connection and permission controls.

The release also includes `FlowState-interactive-preview.html`, a self-contained copy of the ad with its media embedded. Open it in a browser to preview without a build or network connection. Its Live application button requires FlowState running locally on port 5173.

## Rebuild

From `apps/web`, with Vite, the API, and Switch running:

```powershell
node capture-product.mjs
node render-product-video.mjs
node record-ad-live.mjs
node package-ad-preview.mjs
node render-motion-ad.mjs
```

The capture script runs three sandbox verification tasks and one confirmed full-access task that writes only its designated test file. The live-footage script records UI interactions without executing those example tasks. The render uses the packaged HTML so development-server reloads cannot interrupt it.

Outputs are in `apps/web/test-results/product`. The capture directory, credentials, and logs are excluded from Git; finished media is distributed through GitHub releases.
