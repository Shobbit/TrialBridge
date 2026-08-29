# Devpost submission — TrialBridge

## Tagline

Explore clinical trials that may be relevant to you — with a browser agent driving the same interface you see.

---

## Inspiration

Finding a clinical trial is a research project most people are in no condition to run. ClinicalTrials.gov
holds hundreds of thousands of studies, and the part that actually decides whether you can join —
the inclusion and exclusion criteria — is dense prose written for investigators, not patients.

The obvious move is to have an AI read it for you. That is also the dangerous move: an assistant that
answers "yes, you qualify" is confidently wrong at the worst possible moment, and the person finds out
only after travelling to a screening visit.

TrialBridge takes the opposite position. **It never decides.** It searches, it shows what appears to
line up, what appears not to, and — given equal visual weight — what remains unknown. Then it helps
turn those unknowns into questions for the research team, which is the actual next step.

## What it does

- Searches the live **ClinicalTrials.gov API v2** on condition, age, sex, location, travel distance,
  recruitment status and phase.
- Renders each study as a card: title, NCT number, status, conditions, interventions, phase, age range,
  sex eligibility, locations with straight-line distance, sponsor, summary, and a link to the original record.
- For each study, produces a three-way analysis: **reasons it may be relevant**, **apparent mismatches**,
  and **still unknown** — from structured published fields only.
- Keeps a shortlist and a side-by-side comparison view.
- Collects questions to take to the trial investigator or your own doctor.
- Stores everything in the browser. No account, no database, no name, no email, no date of birth.

## How it is a WebMCP application

There is no chatbot in TrialBridge. Instead the page registers **eight tools** on the top-level
document via `document.modelContext.registerTool`, and an external browser agent drives the app
through them:

`get_search_profile` · `update_search_profile` · `search_clinical_trials` · `get_trial_details` ·
`shortlist_trial` · `remove_shortlisted_trial` · `compare_shortlisted_trials` · `save_screening_question`

The design decision that matters: **the tools and the UI share one Zustand store, and both go through
the same action functions.** A tool call is not a parallel API into a headless copy of the app — it is
the same code path a button click takes. So when the agent changes a filter, runs a search or
shortlists a study, the person sees it happen. There is no second copy of the state to drift.

Every tool has a narrow JSON Schema with `additionalProperties: false`, an output schema, correct
read-only/destructive annotations, and returns both human-readable `content` and machine-readable
`structuredContent`. Write tools return a `verification` object — including before/after values —
so the agent can confirm what actually happened rather than assume. No handler ever throws; failures
come back as structured results with stable error codes.

## How we built it

Next.js 16 + TypeScript + Tailwind v4, Zustand for the shared store, Zod for schemas reused by the
API routes, the form *and* the tool handlers — so an agent cannot write a value a human could not type.

Searches proxy through our own route handlers. We verified against the live service that
ClinicalTrials.gov answers simple GETs with `access-control-allow-origin: *` but **rejects CORS
preflight `OPTIONS` with 403**, so direct browser calls are viable only while no custom header is ever
added. Proxying removes that fragility and centralises timeouts, caching and rate-limit handling.
Neither upstream service needs a key, so there are no secrets anywhere.

## Challenges

**Keeping the AI from being helpful in the wrong way.** The hardest work was constraining the product,
not building it. `src/lib/match.ts` compares only structured fields and refuses to interpret criteria
prose. Every analysis is guaranteed to emit at least one "unknown", so no study can ever look fully
cleared. A test suite asserts the output never contains "you are eligible", "you qualify", "we
recommend", "you should", or "diagnos-" across matching, mismatching and fully-unknown inputs.

**Two real bugs the tests caught.** Zod applies a field's `.default()` even after `.partial()` — so the
first version of `update_search_profile({ city })` silently reset every other field to its default.
Rebuilding both schemas from one default-free base fixed it. Separately, re-parsing the profile on
every keystroke ran `.trim()` mid-typing, turning "type 2 diabetes" into "type2diabetes"; whitespace is
now normalised only at the search boundary.

## What we learned

WebMCP is most compelling when the tools are *the application*, not a wrapper around it. Once the tools
and the UI genuinely share state, the agent stops being a black box: every action it takes is visible,
attributed, and reversible by hand. That transparency is what makes it defensible to point an agent at
health information at all.

## What's next

Pagination, saved searches, ICD/MeSH-aware condition matching to reduce false "unknown" verdicts,
travel-time rather than straight-line distance, and a self-hosted geocoder.

---

## Built with

`next.js` `typescript` `react` `tailwindcss` `zustand` `zod` `vitest` `webmcp` `clinicaltrials.gov-api`
`openstreetmap-nominatim` `vercel`

## Try it out

- Live demo: _<add deployment URL>_
- Source: _<add repository URL>_
- Testing guide: `WEBMCP_TESTING.md`

---

> **Important:** TrialBridge does not provide medical advice, diagnose conditions, recommend treatment,
> or confirm eligibility. Final eligibility can be determined only by the clinical-trial investigators
> after medical screening. All sample data used in testing is synthetic; no real patient information
> appears anywhere in the project.
