# TrialBridge

**Explore clinical trials that may be relevant to you — with a browser AI agent driving the same interface you see.**

TrialBridge is a [WebMCP](https://learn.chatgpt.com/docs/webmcp) application. It searches the live
[ClinicalTrials.gov API v2](https://clinicaltrials.gov/data-api/api), explains what appears to line
up with the details you enter, what appears not to, and what remains unknown — and exposes all of
that to a browser agent through eight `document.modelContext.registerTool` tools that operate on the
*same live application state* the human sees.

> **This is not medical advice.** TrialBridge does not diagnose conditions, recommend treatment, or
> confirm eligibility. Final eligibility can be determined only by the clinical-trial investigators
> after medical screening.

---

## What makes this a WebMCP app, not a website with a chatbot

There is no chatbot in this application. Instead, the page registers real tools on the top-level
document, and an external browser agent calls them. The critical property is that **tools and UI
share one store**:

```
                 ┌──────────────────────────────┐
  Browser agent ─┤  document.modelContext       │
  (ChatGPT / Chrome)  .registerTool(...) × 8    │
                 └──────────────┬───────────────┘
                                │  both call the same functions
                 ┌──────────────▼───────────────┐
   Human clicks ─┤  src/lib/actions.ts          │
   and typing    │  src/lib/store.ts (Zustand)  │
                 └──────────────┬───────────────┘
                                │  one subscription
                 ┌──────────────▼───────────────┐
                 │  React components (the page) │
                 └──────────────────────────────┘
```

When the agent changes a filter, runs a search, or shortlists a study, the person sees it on screen
immediately — because there is no second copy of the state to synchronise.

## The eight tools

| Tool | Access | What it does |
| --- | --- | --- |
| `get_search_profile` | read-only | Returns what is currently in the visible form, plus which fields are still blank. |
| `update_search_profile` | write | Updates permitted form fields; returns a before/after record for verification. |
| `search_clinical_trials` | write | Queries the live registry and replaces the on-page results. |
| `get_trial_details` | read-only | Full record including verbatim eligibility criteria; opens the detail panel. |
| `shortlist_trial` | write | Adds a study to the visible shortlist (idempotent). |
| `remove_shortlisted_trial` | write, destructive | Removes a study from the shortlist. |
| `compare_shortlisted_trials` | read-only | Structured side-by-side comparison; switches the page to comparison view. |
| `save_screening_question` | write | Adds a question to the visible list for the study team. |

Every tool declares a narrow JSON Schema with `additionalProperties: false`, an output schema,
correct read-only/destructive annotations, and returns both human-readable `content` and
machine-readable `structuredContent` with an `ok` flag. Write tools additionally return a
`verification` object describing the observable state after the call.

See **[WEBMCP_TESTING.md](./WEBMCP_TESTING.md)** for exact testing instructions.

## The product boundary

TrialBridge is deliberately constrained. [`src/lib/match.ts`](./src/lib/match.ts) compares the
self-entered profile against **structured published fields only** and emits three categories:

- **Reasons it may be relevant** — e.g. the entered age falls within the published range.
- **Apparent mismatches** — e.g. the nearest site is beyond the stated travel limit.
- **Still unknown** — e.g. free-text criteria, which are *never* interpreted automatically.

It never decides eligibility, never scores medical suitability, and never interprets the
inclusion/exclusion prose. Every analysis always produces at least one "unknown", so no study can
ever appear fully cleared. This is enforced by tests in `test/match.test.ts`.

## Privacy

- **No account, no database, no server-side storage.** Profile, shortlist and questions live in
  `localStorage` only.
- **No direct identifiers are collected** — no name, email, date of birth, or medical record number.
  Age is a whole number; sex is optional and collected only because trials themselves restrict on it.
- Only the coarse search terms needed for one registry query ever leave the device.
- A **"Clear my information"** button wipes memory and local storage.
- All fixture data in tests is synthetic. No real patient information appears anywhere.

## Data sources

- **[ClinicalTrials.gov API v2](https://clinicaltrials.gov/data-api/api)** — U.S. National Library
  of Medicine. Every study links back to its original record and shows a retrieval timestamp.
- **[OpenStreetMap Nominatim](https://nominatim.openstreetmap.org/)** — keyless geocoding, used only
  to turn a city name into coordinates for the distance filter. Geocoding data
  © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the
  [ODbL](https://opendatacommons.org/licenses/odbl/).

TrialBridge is an independent project, **not affiliated with, endorsed by, or sponsored by**
ClinicalTrials.gov, the National Library of Medicine, the National Institutes of Health, any
government agency, or any trial sponsor.

### Nominatim usage-policy compliance

The [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/) is binding on
anyone using the shared OSMF service. How each requirement is met — see `src/lib/geocode.ts`, with
the guarantees asserted in `test/geocode.test.ts`:

| Requirement | How it is met |
| --- | --- |
| Max **1 request/second** | A process-wide serialised queue enforces a ≥1.1s gap between upstream calls. Cache hits bypass it entirely. |
| Identifying **User-Agent** | Sent on every request; overridable via `GEOCODER_USER_AGENT` so a deployment can add a contact address. |
| **Caching** required | 30-day in-process LRU cache (city coordinates don't move), plus Next's data cache. Negative results are cached too. |
| **Attribution** | "© OpenStreetMap contributors" with ODbL link, in the page footer. |
| **No autocomplete** | Geocoding runs once per explicit search submission. Nothing geocodes while typing. |
| **Switchable provider** without a software update | Endpoint read from `GEOCODER_URL` at request time. |
| **No personal/confidential data** | Only city, state and country are sent — never an address, postcode, age, sex, or condition. |

> **Before any real traffic:** set `GEOCODER_USER_AGENT` to include your contact address, and
> **self-host Nominatim or use a commercial geocoder**. The rate limiter bounds a single Node
> process; a horizontally scaled deployment could still exceed 1 req/s in aggregate.

## Getting started

Requires Node.js 20.9+ (developed on 24.19).

```bash
npm install
npm run dev          # http://localhost:3000
```

| Script | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm test` | Run the Vitest suite (110 tests) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

**No environment variables or API keys are required.** Neither upstream service needs authentication.

## Architecture

```
src/
├─ app/
│  ├─ page.tsx                    Top-level page (renders the client app directly, never an iframe)
│  ├─ layout.tsx                  Metadata, skip link
│  └─ api/
│     ├─ trials/search/route.ts   POST — validated proxy to /studies
│     └─ trials/[nctId]/route.ts  GET  — proxy for one study
├─ lib/
│  ├─ ctgov/{types,normalize,query,fetch}.ts   Registry types, normaliser, query builder, HTTP
│  ├─ match.ts                    The three-way analysis (product boundary lives here)
│  ├─ schemas.ts                  Zod schemas shared by routes, form and tools
│  ├─ store.ts                    Zustand store — the single source of truth
│  ├─ actions.ts                  Actions shared by UI and tools
│  └─ geo.ts, geocode.ts          Haversine, age parsing, place lookup
├─ webmcp/
│  ├─ tools.ts                    The eight tool definitions
│  └─ WebMcpProvider.tsx          Feature detection + registration
└─ components/                    React UI
```

### Why requests are proxied through our own routes

ClinicalTrials.gov answers simple GETs with `access-control-allow-origin: *`, but **rejects CORS
preflight `OPTIONS` with 403** — verified against the live service. Direct browser calls would
therefore work only as long as no custom header is ever added. Proxying through
`/api/trials/*` removes that constraint, centralises rate-limit and timeout handling, and allows
response caching. No secrets are involved: neither upstream API requires a key.

## Private beta: keeping the site unlisted and gated

The deployment is meant to be reachable only by people who have the link *and* the
password. Four layers, strongest first:

| Layer | File | What it actually does |
| --- | --- | --- |
| **HTTP Basic auth** | `src/proxy.ts` | **The real access control.** Blocks every page, asset, JS bundle and API route without the shared password. Active only when `SITE_PASSWORD` is set. |
| `X-Robots-Tag` header | `next.config.ts` | `noindex, nofollow, noarchive, nosnippet, noimageindex` on **every** response, including JSON. Honoured even when a URL is reached directly. |
| `<meta name="robots">` | `src/app/layout.tsx` | Same directives in the HTML itself. |
| `robots.txt` | `public/robots.txt` | `Disallow: /` for all agents, plus ~25 named crawlers including GPTBot, ClaudeBot, PerplexityBot, CCBot and Bytespider. |

> **Be clear about what robots.txt is.** It is a *convention*, not a lock — it asks
> well-behaved crawlers not to index the site, and they comply. It stops nothing else.
> A scraper that ignores it faces no obstacle from robots.txt at all. The password is
> what actually prevents access, which is why it is layer one.

### Turning the gate on

On your host, set an environment variable and redeploy:

```
SITE_PASSWORD=<long random string>
SITE_USERNAME=beta            # optional, defaults to "beta"
```

Generate a password with:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

Visitors then get a browser login dialog. Local development is unaffected: with
`SITE_PASSWORD` unset the gate is inert, so `npm run dev` never prompts.

**To reopen the site** (for example when handing the URL to challenge judges), delete
`SITE_PASSWORD` from the host and redeploy. Nothing else changes.

Behaviour is pinned by `test/access-control.test.ts` (13 tests) and was verified against
a running production server: unauthenticated requests to `/` and `/api/trials/search`
return 401, correct credentials return 200, and `/robots.txt` stays readable so crawlers
can see the disallow.

### Limits worth knowing

- The credential is **shared**, not per-tester. Anyone with it has full access, and you
  cannot tell testers apart. Rotate it by changing the variable and redeploying.
- Basic credentials are base64, not encrypted — **only ever serve over HTTPS**. Vercel
  and Replit both provide it automatically.
- A password-gated URL cannot be reviewed by anyone you have not given the password to.
  Decide before submission whether judges need it open.

## Deployment

### Vercel

```bash
npm i -g vercel
vercel          # preview
vercel --prod   # production
```

Or connect the repository at [vercel.com/new](https://vercel.com/new). Framework preset **Next.js**
is detected automatically; no environment variables are needed. The two API routes deploy as
serverless functions.

### Netlify

```bash
npm i -g netlify-cli
netlify deploy          # preview
netlify deploy --prod   # production
```

Or connect the repository at [app.netlify.com/start](https://app.netlify.com/start). Set **build
command** `npm run build` and leave the publish directory to the official
[`@netlify/plugin-nextjs`](https://github.com/netlify/next-runtime), which Netlify installs
automatically for Next.js projects and which is required for the API routes to work.

> Serve over **HTTPS**. Browser WebMCP implementations expose `document.modelContext` only in secure
> contexts (`localhost` also counts).

## Known limitations

See the "Remaining limitations" section of [WEBMCP_TESTING.md](./WEBMCP_TESTING.md) for an honest list.

## Licence

[MIT](./LICENSE).
