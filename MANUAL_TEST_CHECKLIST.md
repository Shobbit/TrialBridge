# Manual testing checklist

For a non-developer. No coding required. **Takes about 10 minutes.**

Open **http://localhost:3000** in your browser and work down the list. Tick each box only if you
actually see what's described. If something doesn't match, note it — that's a bug worth reporting.

---

## A. First impressions

- [ ] The page loads without an error message.
- [ ] The heading reads **TrialBridge**.
- [ ] A **red warning box** near the top says this is not medical advice and that only the trial
      investigators can decide eligibility.
- [ ] Below it, a **grey badge** says *"WebMCP not available in this browser"*.
      **This is correct and expected** in a normal browser — it is the required fallback notice.
- [ ] Click **"What is this?"** next to the badge. It expands and lists eight tool names.

## B. The form asks only for what it needs

- [ ] There is **no** box asking for your name.
- [ ] There is **no** box asking for your email address.
- [ ] There is **no** box asking for your date of birth (age is a plain number).
- [ ] There is no sign-up, login, or password anywhere.

## C. Run a search

Use these made-up details — **do not use real medical information**:

- [ ] Type `metastatic melanoma` into **Medical condition or diagnosis**.
- [ ] Type `54` into **Age in years**.
- [ ] **Leave Sex on "Prefer not to say" for now.** It is optional, and the app must work
      without it. (You will change it in section C2.)
- [ ] Type `Chicago` into **City** and `Illinois` into **State or region**.
- [ ] Drag the travel-distance slider to about **100 miles**.
- [ ] Click **Search trials**.
- [ ] Briefly, grey placeholder boxes appear (the loading state).
- [ ] Real trial results appear within a few seconds.

## C2. The optional Sex field

This field is optional and behaves differently from the others: **it never removes studies from
your results.** It only changes the wording of the analysis, because hiding a study would be the
app deciding your eligibility for you — which it must never do.

- [ ] With Sex still on **Prefer not to say**, find a result and read its **Still unknown** box.
      If that study restricts enrolment by sex, it should say so and note that no sex was entered.
- [ ] Now change **Sex** to `Female`. The results **do not disappear or reload**.
- [ ] Look at the three coloured boxes again. The wording has changed — most studies now say the
      trial accepts participants of any sex under **Reasons it may be relevant**.
- [ ] If any study enrols one sex only and it differs from what you chose, it appears under
      **Apparent mismatches** — but the study is **still listed**, not hidden. This is intended.
- [ ] Set Sex back to **Prefer not to say**. Everything still works.
- [ ] Confirm the helper text under the field explains it is optional and only used because some
      trials restrict enrolment by sex.

## D. Check a result card

Look at the first result.

- [ ] It has a title and an **NCT number** (like `NCT05361174`).
- [ ] It shows a status such as **Recruiting**.
- [ ] It shows a phase, a sponsor, an age range, and a location.
- [ ] It shows a distance like *"~82 mi to nearest site"*.
- [ ] There are **three coloured boxes**: *Reasons it may be relevant*, *Apparent mismatches*,
      and *Still unknown*.
- [ ] The **Still unknown** box is never empty — it always says the detailed criteria were not
      evaluated automatically. **This is the single most important thing on the page.**
- [ ] Nowhere does it say you are eligible, that you qualify, or what you should do.
- [ ] Click **ClinicalTrials.gov record ↗**. A new tab opens on the real clinicaltrials.gov site
      showing **the same NCT number**.

## E. Read the full criteria

- [ ] Click **View eligibility criteria** on a result.
- [ ] A panel slides in from the right.
- [ ] It shows the full inclusion and exclusion criteria as published.
- [ ] It says the criteria are shown exactly as published and are not interpreted.
- [ ] It shows a list of study locations.
- [ ] It shows when the information was retrieved.
- [ ] Press the **Escape** key. The panel closes.

## F. Shortlist and compare

- [ ] Click **Add to shortlist** on two different results.
- [ ] Both appear in **Your shortlist** on the left.
- [ ] Click **Compare**.
- [ ] A table appears comparing status, phase, sponsor, age range, sex, nearest site,
      interventions, inclusion criteria, exclusion criteria, mismatches and unknowns.
- [ ] On a narrow window the table scrolls sideways **inside its own box** — the whole page does
      not scroll sideways.
- [ ] Click **Remove** on one. It disappears immediately.

## G. Questions

- [ ] In **Questions for the study team**, type
      `How often would I need to visit the study site?` and click **Add**.
- [ ] It appears in the list below.
- [ ] Click **Copy all**, then paste into Notepad. Your question is there.
- [ ] Click the **×** next to it. It disappears.

## H. Errors and empty results

- [ ] Clear the condition box and type `zzzqqxxnotarealcondition`, then **Search trials**.
- [ ] You get a friendly message saying no studies matched, with suggestions — **not** a crash or a
      blank page.
- [ ] Turn off your Wi-Fi, search again. You get a clear error message explaining the problem.
      Turn Wi-Fi back on.

## I. Privacy — the important one

- [ ] Add a couple of studies to your shortlist.
- [ ] **Refresh the page.** Your details and shortlist are still there (saved in this browser).
- [ ] Click **Clear my information**.
- [ ] A confirmation box appears explaining this cannot be undone.
- [ ] Click **Clear everything**.
- [ ] The form is empty, the shortlist is empty, and the questions are gone.
- [ ] Refresh the page again. Everything is still empty — it really was deleted.

## J. Phone and keyboard

- [ ] Make the browser window narrow (or open the site on your phone). Everything stacks into one
      readable column; nothing is cut off or overlapping.
- [ ] Click at the very top of the page, then press **Tab** repeatedly. A visible outline moves
      through the links and form fields in a sensible order.
- [ ] You can reach the **Search trials** button using only Tab, and activate it with **Enter**.

## K. Footer

- [ ] The footer says the data comes from ClinicalTrials.gov.
- [ ] It says TrialBridge is **not affiliated with or endorsed by** ClinicalTrials.gov, the NLM,
      the NIH, or any government agency.
- [ ] It credits **© OpenStreetMap contributors** with a working link.
- [ ] It says your information is stored only in this browser.

---

## If you found a problem

Note down: what you clicked, what you expected, what actually happened, and which browser you used.
A screenshot helps.

**Note:** sections A–K test the ordinary website. Testing the AI-agent half needs the Chrome flags
or the ChatGPT desktop app — see [START_HERE.md](./START_HERE.md).
