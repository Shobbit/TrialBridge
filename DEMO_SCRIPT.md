# TrialBridge — demo video script

**Target length: 2 minutes 45 seconds.** Screen recording with voiceover. No face needed.

**Before recording:** clear browser storage, have a WebMCP-capable agent open on the page, and use
the synthetic persona below. Never use real patient information.

**Persona (fictional):** 54 years old, metastatic melanoma, Chicago, Illinois.

---

### [0:00 – 0:18] The problem

> **VOICEOVER**
> ClinicalTrials.gov lists over half a million studies. The part that decides whether you can
> actually join is buried in pages of inclusion and exclusion criteria written for investigators.
>
> The tempting fix is an AI that reads it and tells you "yes, you qualify." That's also the most
> dangerous thing it could say.

**SCREEN:** ClinicalTrials.gov search results, then scroll a dense eligibility-criteria block.

---

### [0:18 – 0:32] What TrialBridge is

> **VOICEOVER**
> TrialBridge takes the opposite approach. It never decides. It shows what appears to line up, what
> doesn't — and what's still unknown. And it's a WebMCP app, so a browser agent drives the exact
> interface you're looking at.

**SCREEN:** TrialBridge loads. Pause on the red disclaimer, then on the green badge:
**"WebMCP active — 8 tools registered."** Expand *"What is this?"* to flash the eight tool names.

---

### [0:32 – 0:48] A partial profile, entered by hand

> **VOICEOVER**
> I'll enter part of my situation by hand — condition, age, city. Notice what it never asks for: no
> name, no email, no date of birth. Everything stays in this browser.

**SCREEN:** Type `metastatic melanoma`, age `54`, city `Chicago`, state `Illinois`. Leave travel
distance and prior treatments **blank**. Do **not** press Search.

---

### [0:48 – 1:10] The agent takes over

> **VOICEOVER**
> Now I'll just ask.

**SCREEN:** Type into the agent: **"Find recruiting trials that may be relevant to me within
travelling distance."**

> **VOICEOVER**
> It reads the form with `get_search_profile`, sees travel distance is blank, and fills it in with
> `update_search_profile` — and you can watch the slider move. Then it searches.

**SCREEN:** The travel-distance slider visibly moves. Results populate. Point at the header:
**"Showing 20 of 31"** and the retrieval timestamp.

---

### [1:10 – 1:35] The three-way analysis — the heart of it

> **VOICEOVER**
> Here's the important part. Every card splits into three: reasons it *may* be relevant, apparent
> mismatches, and still unknown.
>
> That third column gets equal weight on purpose. Age and location come from structured fields, so
> those can be checked. The actual criteria are prose — TrialBridge quotes them and refuses to
> interpret them.

**SCREEN:** Zoom a card showing all three columns. Highlight: *"nearest site is about 82 miles away,
within the 100-mile limit entered"* and *"Detailed inclusion and exclusion criteria... are not
evaluated automatically."*

---

### [1:35 – 1:55] Details and shortlist

> **VOICEOVER**
> The agent pulls full records with `get_trial_details` and shortlists the ones worth a closer look —
> with a factual reason, not a verdict.

**SCREEN:** Detail drawer opens showing verbatim criteria. Close it. Two entries appear in the
shortlist tagged **"Added by agent"** with notes.

---

### [1:55 – 2:12] The human stays in control

> **VOICEOVER**
> And I can overrule it. I remove one — and the agent sees that on its very next call. The state is
> genuinely shared; there's no separate copy it's reasoning about.

**SCREEN:** Click **Remove** on one entry. It disappears.

---

### [2:12 – 2:35] Compare and prepare questions

> **VOICEOVER**
> Then: compare what's left, and turn everything it *couldn't* determine into questions for the
> research team.

**SCREEN:** Type: **"Compare the remaining trials and prepare questions for the research teams."**
Comparison table renders. Questions appear tagged **"Suggested by agent"** — e.g. *"Would my previous
immunotherapy affect my eligibility for this study?"*

---

### [2:35 – 2:45] Close

> **VOICEOVER**
> Search, compare, and walk in prepared — without anyone pretending to know the answer. Final
> eligibility is decided by the investigators after screening. That's the whole point.

**SCREEN:** Click **Clear my information** → confirm. Everything empties. End on the disclaimer with
the URL on screen.

---

## Shot checklist

- [ ] "WebMCP active — 8 tools registered" badge clearly legible
- [ ] The eight tool names visible at least once
- [ ] A form field visibly changing from an agent call (slider is the clearest)
- [ ] All three analysis columns readable, including "Still unknown"
- [ ] Verbatim eligibility criteria on screen
- [ ] "Added by agent" attribution visible
- [ ] Human removing an agent-added entry
- [ ] Comparison table
- [ ] "Suggested by agent" question
- [ ] Disclaimer legible at start and end
- [ ] No real patient data at any point

## Do not say

- ❌ "It finds trials you're eligible for" → ✅ "trials that may be relevant"
- ❌ "It matches you to trials" → ✅ "it shows what appears to line up, and what's unknown"
- ❌ "It diagnoses / recommends" → the app does neither
