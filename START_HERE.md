# Start here

A short, practical guide. Full detail lives in [WEBMCP_TESTING.md](./WEBMCP_TESTING.md).

---

## 1. Run it (30 seconds)

```bash
cd trialbridge
npm run dev
```

Open **http://localhost:3000**.

Use it like a normal website: type a condition (e.g. `metastatic melanoma`), an age, a city, press
**Search trials**. Real studies load from ClinicalTrials.gov. Shortlist a few, press **Compare**,
add a question, press **Clear my information**.

If that all works, the human half of the app is done. You'll see a grey badge saying
*"WebMCP not available in this browser"* — that's expected in a normal browser, and it's the required
fallback notice.

---

## 2. Prove the WebMCP half works — pick one of three

### Option A — Chrome flags (easiest, you can do this now)

You need **both** flags. The first exposes the API; the second adds the DevTools panel.
Chrome 149+ required — you have 152.

1. `chrome://flags/#enable-webmcp-testing` → **Enabled**
2. `chrome://flags/#devtools-webmcp-support` → **Enabled**
3. **Relaunch Chrome** (flag changes don't affect already-open windows)
4. Open http://localhost:3000 — the badge should turn green:
   **"WebMCP active — 8 tools registered"**
5. Open **DevTools → Application → WebMCP** and confirm all eight tools are listed.
6. Run a read tool: `get_search_profile` with `{}` → expect `readyToSearch: false`. Page must not change.
7. Run a write tool: `update_search_profile` with
   `{"condition":"metastatic melanoma","age":54,"city":"Chicago","state":"Illinois"}`
   → **watch the form fill itself in.** That's the proof.

Sanity check in the Console if the panel doesn't show:
```js
typeof document.modelContext.registerTool   // "function"
```

There's a results table to fill in at section 1B of [WEBMCP_TESTING.md](./WEBMCP_TESTING.md).

### Option B — Console shim (works in any browser, no setup)

Proves the tools register and that calling them changes the page. In DevTools → **Sources → Snippets**,
create a snippet, paste this, run it, **then reload the page**:

```js
window.__tbTools = new Map();
document.modelContext = {
  registerTool(t) { window.__tbTools.set(t.name, t); console.log('registered:', t.name); return Promise.resolve(); }
};
```

Then in the Console:

```js
const call = (n, a = {}) => window.__tbTools.get(n).execute(a);

[...window.__tbTools.keys()]                    // all 8 tool names
await call('update_search_profile', { condition: 'metastatic melanoma', age: 54, city: 'Chicago' });
await call('search_clinical_trials', {});
```

**Watch the page while you run these.** The form fills in; result cards appear. That's the whole point.

### Option C — ChatGPT desktop app (the real demo, needed for the video)

1. Update the **ChatGPT desktop app** to the latest version.
2. Open the site in its **built-in browser**.
3. Set the model to **GPT-5.6 Sol** or **Terra** (Luna has WebMCP disabled; not available on
   Enterprise/Edu workspaces).
4. Ask: *"Find recruiting trials that may be relevant to me within travelling distance."*

For a public URL, deploy first (`vercel --prod`) — it must be HTTPS.

---

## 3. Prove it automatically (no browser needed)

```bash
npm test
```

110 tests. The 17 in `test/integration.test.tsx` render the real app, register the real tools through
a mock `document.modelContext`, call them the way an agent would, and assert the **visible DOM**
changed. This is your evidence that tools and UI share live state.

```bash
npm run lint && npm run typecheck && npm run build
```

---

## 4. Ship it

```bash
npm i -g vercel
vercel --prod
```

No environment variables. Copy the HTTPS URL into `SUBMISSION.md`.

---

## 5. Does this meet the challenge brief?

| Requirement | Where |
| --- | --- |
| Imperative `document.modelContext.registerTool` on the top-level page | `src/webmcp/WebMcpProvider.tsx`, mounted by `src/app/page.tsx` |
| Not in an iframe | Verify: `document.querySelectorAll('iframe').length === 0` |
| Not just form automation / not a chatbot | There is no chatbot. Tools call the same actions as the buttons. |
| 8 tools with narrow schemas, `additionalProperties: false`, annotations, structured output, error handling | `src/webmcp/tools.ts` |
| Tools and UI share live state | `src/lib/store.ts` + `src/lib/actions.ts`; proven in `test/integration.test.tsx` |
| Live ClinicalTrials.gov v2 data, no fabrication | `src/lib/ctgov/*`, `src/app/api/trials/*` |
| Never diagnoses / never confirms eligibility | `src/lib/match.ts`; enforced by `test/match.test.ts` |
| Disclaimer, local-only storage, "Clear my information" | `src/components/TrialBridgeApp.tsx` |
| Fallback notice when WebMCP is absent | `src/components/AgentStatus.tsx` |
| Tests, README, licence, deploy instructions | `test/`, `README.md`, `LICENSE`, `README.md#deployment` |

**The one thing still unproven:** tools have not been exercised by a *real* shipping agent — only by
a mock matching the documented contract. Do Option C before recording the video.

---

## 6. Submission checklist

- [ ] Deploy to Vercel, get the HTTPS URL
- [ ] Run Option C and confirm ChatGPT actually calls the tools
- [ ] Record the demo (script: [DEMO_SCRIPT.md](./DEMO_SCRIPT.md), 2:45)
- [ ] Push to a public repo (MIT licence included)
- [ ] Paste [SUBMISSION.md](./SUBMISSION.md) into Devpost; fill in the two URL placeholders
- [ ] Check the challenge page for the deadline and any extra required fields
