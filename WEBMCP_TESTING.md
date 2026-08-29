# WebMCP testing guide

Exact instructions for verifying that TrialBridge is a genuine WebMCP application — that all eight
tools register on the top-level page, and that every tool call is reflected in the visible interface.

---

## 0. Prerequisites

```bash
npm install
npm run dev        # http://localhost:3000
```

No API keys or environment variables are needed.

`document.modelContext` is exposed only in **secure contexts**. `http://localhost` counts as secure,
so local testing works; any other host must be served over HTTPS.

### Which browsers implement WebMCP

There are two hosts today, and they serve different purposes:

| Host | Use it for | Requirements |
| --- | --- | --- |
| **Chrome 149+** with two flags enabled | **Local development.** Confirms `document.modelContext` exists, tools register, and lets you inspect and run them from DevTools. | Chrome 149 or newer, plus **both** flags below. |
| **ChatGPT desktop app** (built-in browser) | **The real agent demo.** ChatGPT actually calls your tools. | Latest desktop app; model must be **GPT-5.6 Sol** or **Terra** (Luna has WebMCP disabled). Not available in Enterprise or Edu workspaces. |

Chrome also runs a public **origin trial** from Chrome 149 if you want the API enabled for real
visitors on a deployed domain without a flag; register the origin and add the trial token.

#### Chrome requires BOTH flags

Enabling only the first gives you the API but **no DevTools panel**. Set both:

| Flag | What it enables |
| --- | --- |
| `chrome://flags/#enable-webmcp-testing` | Exposes `document.modelContext` so tools can register. |
| `chrome://flags/#devtools-webmcp-support` | Adds the **DevTools → Application → WebMCP** panel that lists registered tools and lets you execute them by hand. |

Set each to **Enabled**, then **relaunch Chrome**. Flag changes do not apply to already-open windows.

> If you have neither host, section 1 below still verifies registration in **any** browser using a shim.

---

## 1. Verify registration without an agent (works in any browser)

This confirms the tools are declared correctly and are registered on the top-level document, even if
your browser has no WebMCP implementation.

1. Open <http://localhost:3000>.
2. Open DevTools → Console.
3. Check whether the browser implements the API:

```js
typeof document.modelContext?.registerTool
// "function"  → your browser implements WebMCP
// "undefined" → it does not; the page shows the fallback notice and still works
```

4. If it is `undefined`, install a shim **before reloading** to observe registration. Paste this,
   then reload the page:

```js
// Paste, press Enter, THEN reload the page.
sessionStorage.setItem('tb-shim', '1');
```

Then paste the following into the console **immediately after** reload (or add it as a DevTools
snippet that runs on load):

```js
window.__tbTools = new Map();
document.modelContext = {
  registerTool(tool) {
    window.__tbTools.set(tool.name, tool);
    console.log('registered:', tool.name);
    return Promise.resolve();
  },
};
```

Because registration happens in a React effect on mount, the shim must exist before the app mounts.
The simplest reliable approach is a DevTools **snippet** or a bookmarklet; alternatively, temporarily
add the shim to the top of `src/app/layout.tsx` during testing.

5. Confirm all eight tools registered:

```js
[...window.__tbTools.keys()]
// [
//   "get_search_profile", "update_search_profile", "search_clinical_trials",
//   "get_trial_details", "shortlist_trial", "remove_shortlisted_trial",
//   "compare_shortlisted_trials", "save_screening_question"
// ]
```

6. Confirm the page is not using an iframe for registration:

```js
window.top === window.self   // true — registration is on the top-level page
document.querySelectorAll('iframe').length   // 0
```

---

## 1B. Verify in Chrome DevTools → Application → WebMCP

Requires **both** flags from section 0 and a Chrome relaunch.

1. Open <http://localhost:3000>.
2. The badge near the top of the page should read **"WebMCP active — 8 tools registered"**.
   If it still says *not available*, one of the two flags is off or Chrome was not relaunched.
3. Open **DevTools → Application → WebMCP**.
4. Confirm all eight tools are listed:

   - [ ] `get_search_profile`
   - [ ] `update_search_profile`
   - [ ] `search_clinical_trials`
   - [ ] `get_trial_details`
   - [ ] `shortlist_trial`
   - [ ] `remove_shortlisted_trial`
   - [ ] `compare_shortlisted_trials`
   - [ ] `save_screening_question`

5. Check that each entry shows its description and input schema, and that the read-only tools are
   distinguishable from the write tools.

### Execute a representative read tool

Select **`get_search_profile`** and run it with `{}`.

Expected: `ok: true`, `readyToSearch: false`, and `missingFields` containing `"condition"`.
The page must **not** change — this tool is annotated `readOnlyHint: true`.

### Execute a representative write tool

Select **`update_search_profile`** and run it with:

```json
{ "condition": "metastatic melanoma", "age": 54, "city": "Chicago", "state": "Illinois" }
```

Expected: `ok: true`, `updatedFields` listing all four, and a `verification.changes` array giving the
previous and new value of each. **Watch the page while it runs** — the four form fields must visibly
fill in.

Then run **`search_clinical_trials`** with `{}` and confirm real trial cards appear on the page.

### Record your results

| Tool | Ran from DevTools | Result `ok` | Page visibly changed | Notes |
| --- | --- | --- | --- | --- |
| `get_search_profile` | ☐ | ☐ | n/a (read-only) | |
| `update_search_profile` | ☐ | ☐ | ☐ | |
| `search_clinical_trials` | ☐ | ☐ | ☐ | |
| `get_trial_details` | ☐ | ☐ | ☐ | |
| `shortlist_trial` | ☐ | ☐ | ☐ | |
| `remove_shortlisted_trial` | ☐ | ☐ | ☐ | |
| `compare_shortlisted_trials` | ☐ | ☐ | ☐ | |
| `save_screening_question` | ☐ | ☐ | ☐ | |

> Chrome version tested: ______   Date: ______

If the DevTools panel does not appear at all, fall back to section 1's console shim — it verifies the
same behaviour and is what the automated suite in `test/integration.test.tsx` exercises.

---

## 2. Verify tool calls update the visible interface

With the shim in place, call the tools directly and **watch the page**, not the console.

```js
const call = (name, args = {}) => window.__tbTools.get(name).execute(args);
```

### 2.1 Read the empty form

```js
await call('get_search_profile');
```

Expect `structuredContent.readyToSearch === false` and `missingFields` containing `"condition"`.

### 2.2 Write to the form — **watch the form fields change on screen**

```js
await call('update_search_profile', {
  condition: 'metastatic melanoma',
  age: 54,
  city: 'Chicago',
  state: 'Illinois',
  travelDistanceMiles: 100,
});
```

✅ The condition, age, city, state fields and the travel-distance slider visibly update.
✅ The result's `verification.changes` lists each field's previous and new value.

### 2.3 Search — **watch result cards appear**

```js
await call('search_clinical_trials', {});
```

✅ Trial cards render with NCT numbers, status, phase, sponsor, ages, locations and source links.
✅ The header shows "Showing N of M" and a retrieval timestamp.
✅ Each card shows *Reasons it may be relevant* / *Apparent mismatches* / *Still unknown*.

### 2.4 Read full criteria — **watch the detail panel slide open**

```js
const r = await call('search_clinical_trials', {});
const id = r.structuredContent.trials[0].nctId;
await call('get_trial_details', { nctId: id });
```

✅ The detail drawer opens showing that study's verbatim eligibility criteria.

### 2.5 Shortlist — **watch the shortlist populate**

```js
await call('shortlist_trial', { nctId: id, note: 'Published age range includes the age entered.' });
```

✅ The entry appears in "Your shortlist", tagged **Added by agent**, with the note shown.
✅ Calling it a second time returns `added: false, alreadyPresent: true` and does not duplicate.

### 2.6 Remove

```js
await call('remove_shortlisted_trial', { nctId: id, reason: 'Not interested' });
```

✅ The entry disappears from the page. A second call returns `removed: false` without erroring.

### 2.7 Compare (shortlist at least two studies first)

```js
await call('compare_shortlisted_trials', {});
```

✅ Returns per-study status, phase, sponsor, age range, sex eligibility, nearest site, interventions,
major inclusion/exclusion criteria, apparent mismatches and unknowns.
✅ Select **Compare** in the shortlist panel to see the same fields rendered as a table.

### 2.8 Save a question — **watch it appear in the list**

```js
await call('save_screening_question', {
  question: 'Would my previous immunotherapy affect eligibility for this study?',
  nctId: id,
  rationale: 'The criteria mention prior therapy but not how it is treated.',
});
```

✅ The question appears under "Questions for the study team", tagged **Suggested by agent**.

---

## 3. Verify error handling

Each should return `isError: true` with a stable `structuredContent.error.code`:

```js
await call('update_search_profile', { emailAddress: 'x@example.com' }); // INVALID_INPUT
await call('update_search_profile', { age: 999 });                     // INVALID_INPUT
await call('update_search_profile', {});                               // NO_FIELDS
await call('get_trial_details', { nctId: 'nonsense' });                 // INVALID_INPUT
await call('compare_shortlisted_trials', {});                          // EMPTY_SHORTLIST (when empty)
await call('save_screening_question', { question: 'x', nctId: 'NCT01234567' }); // INVALID_INPUT / UNKNOWN_TRIAL
```

✅ No call ever throws — every failure comes back as a structured result.

---

## 4. Verify the fallback for incompatible browsers

1. Open the page in a browser with no WebMCP support (and no shim).
2. ✅ A notice reads *"WebMCP not available in this browser"* and explains that testing requires a
   compatible browser.
3. ✅ Every feature still works by hand: search, shortlist, compare, questions, clear.

---

## 5. Verify privacy

1. Enter details, search, shortlist a study, add a question.
2. DevTools → Application → Local Storage → key `trialbridge:v1`.
   ✅ Contains only `profile`, `shortlist` and `questions`. No identifiers.
3. DevTools → Network. ✅ The only outbound requests are to `/api/trials/*` on your own origin.
4. Select **Clear my information** → confirm.
   ✅ The form, shortlist and questions empty, and the `trialbridge:v1` key is removed.

---

## 6. The full human–agent demonstration

With a WebMCP-capable agent on the page (ChatGPT desktop app's built-in browser, using GPT-5.6 Sol or Terra):

1. Type a partial profile by hand: condition `metastatic melanoma`, city `Chicago`, age `54`.
   Leave travel distance and prior treatments blank.
2. Ask: **"Find recruiting trials that may be relevant to me within travelling distance."**
3. The agent calls `get_search_profile`, notices the blank fields, and may ask about travel distance
   before calling `update_search_profile` and `search_clinical_trials`.
4. ✅ Results appear on the page.
5. The agent calls `get_trial_details` on promising studies.
6. ✅ It distinguishes apparent matches, apparent mismatches, and still-unknown information — and
   does not claim you are eligible.
7. The agent calls `shortlist_trial` on suitable studies. ✅ They appear in the shortlist.
8. Remove one by hand. ✅ The agent sees the change on its next call.
9. Ask: **"Compare what's left and prepare questions for the research teams."**
   ✅ `compare_shortlisted_trials` and `save_screening_question` run; questions appear on the page.

---

## 7. Automated verification

```bash
npm test        # 110 tests
npm run lint
npm run typecheck
npm run build
```

`test/integration.test.tsx` renders the real application, registers the real tools through a mock
`document.modelContext`, invokes them as an agent would, and asserts against the **rendered DOM** —
covering registration, every write tool's visible effect, error states and the clear-data flow.

---

## Remaining limitations (honest list)

**WebMCP**

- The Site Tools API is new and its surface may change. `unregisterTool` is called defensively on
  unmount but is not present in every implementation, so re-registration behaviour across client-side
  navigations depends on the host.
- Tools were verified against a mock `document.modelContext` that matches the documented contract and
  against the live app in a browser; they have **not** been exercised against every shipping agent.
  Hosts differ in whether they read `content` or `structuredContent`, which is why both are returned.
- Registration happens in a React effect after mount. An agent that enumerates tools in the same tick
  as navigation may need one retry.

**Data and matching**

- Free-text inclusion/exclusion criteria are **never** interpreted. Most real eligibility rules live
  in that prose, so "still unknown" is usually the largest category — by design, not by omission.
- `splitCriteria` is a presentational heuristic over line breaks and Inclusion/Exclusion headings. It
  quotes verbatim and never re-words, but registry formatting varies, so excerpts can be imperfect.
  The full criteria are always shown alongside.
- Condition matching is literal token overlap. Different vocabulary for the same disease is reported
  as *unknown*, never as a mismatch.
- Distance is **straight-line**, not travel time. It ignores roads, borders and transport.
- Some studies publish no location coordinates; distance is then unknown and the geo filter cannot
  apply to them.
- Search relevance is whatever ClinicalTrials.gov returns. TrialBridge does not re-rank by
  suitability.

**Infrastructure**

- Nominatim is rate-limited and asks for under 1 request/second. A busy deployment should switch to a
  self-hosted or commercial geocoder. Geocoding failure degrades to place-name matching with a
  visible warning; it never fails the search.
- ClinicalTrials.gov publishes no formal rate limit. Responses are cached for 5 minutes server-side
  and HTTP 429 is surfaced as a retryable error, but sustained heavy traffic is untested.
- Results are limited to the first page (up to 50 studies). `nextPageToken` is returned in the
  response metadata but no pagination UI is built.
- The `OPTIONS` preflight on clinicaltrials.gov returns 403, so any future move to direct browser
  calls must use simple requests only. This is why the app proxies through its own routes.

**Scope**

- No accounts, no server-side persistence, no chatbot — deliberately. Clearing browser storage or
  switching devices loses the shortlist.
- The interface is English-only, and the registry's own content is predominantly English.
