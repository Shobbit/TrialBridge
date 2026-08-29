# Deploying TrialBridge on Replit

For a password-protected private beta. **~15 minutes.**

---

## First: GitHub or zip upload?

**Use GitHub.** Both work, but the difference shows up on your second change, not your first.

| | GitHub → Replit | Zip upload |
| --- | --- | --- |
| First deploy | ~3 min (connect + import) | ~2 min (drag and drop) |
| **Every later change** | `git push`, then Pull in Replit | **Re-zip and re-upload the whole project** |
| Version history | Kept — you can roll back a bad change | Lost |
| Private code | Private repo works fine | Fine |
| If Replit breaks something | Your code is safe in GitHub | Only copy is in Replit |

The project already has git initialised with clean commits, so the GitHub route costs you almost
nothing extra now and saves real pain later. **A zip is included anyway** if you want to start
immediately — see the last section.

> Whichever you pick: **make the GitHub repo private.** A public repo publishes the source no matter
> how well the deployed site is locked down.

---

## Route A — GitHub → Replit (recommended)

### 1. Push to a private GitHub repo

Create a **private** repo at [github.com/new](https://github.com/new) — no README, no .gitignore
(this project has both). Then:

```bash
cd C:\Users\shobh\Code\BrothersHealthcare\trialbridge
git remote add origin https://github.com/YOURNAME/trialbridge.git
git push -u origin main
```

### 2. Import into Replit

1. Replit → **Create App** → **Import from GitHub**
2. Connect your GitHub account if prompted, and **grant access to private repos**
3. Pick `trialbridge`
4. Replit reads the committed `.replit` file, so the language and run command are already correct

### 3. Install dependencies

In the Replit **Shell** tab:

```bash
npm install
```

### 4. Set your secrets

Replit **Tools → Secrets** (the padlock). These are environment variables — never put them in a file.

| Key | Value |
| --- | --- |
| `SITE_PASSWORD` | a long random string (see below) |
| `SITE_USERNAME` | `beta` |
| `GEOCODER_USER_AGENT` | `TrialBridge/1.0 (+mailto:your@email.com)` |

Generate the password in the Replit Shell:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

### 5. Check it runs in the workspace

Press **Run**. The webview should load and prompt for a username and password. Log in with
`beta` and your password, then run a search to confirm live ClinicalTrials.gov data appears.

> The workspace URL is temporary and sleeps. Deploy for a stable link.

### 6. Deploy

1. Click **Deploy**
2. Choose **Autoscale** — this app needs a Node server for the `/api/trials/*` routes.
   **Do not pick Static**; the pages would load but every search would 404.
3. Build command: `npm run build`
4. Run command: `npm run start:replit`
   *(both are already in `.replit`, so they should be pre-filled)*
5. **Re-enter the secrets** if the deployment pane asks — deployment secrets are separate from
   workspace secrets in Replit
6. Deploy

You get `https://<name>.replit.app` — HTTPS automatically, which WebMCP requires.

### 7. Verify before sharing

In the Shell, replacing the URL and password:

```bash
# Must be 401
curl -s -o /dev/null -w "%{http_code}\n" https://YOUR-APP.replit.app/

# Must be 200
curl -s -o /dev/null -w "%{http_code}\n" -u "beta:YOURPASSWORD" https://YOUR-APP.replit.app/

# Must contain "Disallow: /"
curl -s https://YOUR-APP.replit.app/robots.txt | head -3
```

If the first returns 200, the secret did not reach the deployment — set it in the deployment's own
secrets and redeploy.

### Making changes later

```bash
git add -A
git commit -m "what changed"
git push
```

Then in Replit: **Git pane → Pull**, then **Redeploy**.

---

## Route B — Zip upload

Use this only if you want to skip GitHub for now.

1. **Create App** → choose the **Node.js** template
2. Delete the placeholder files Replit created
3. Drag `trialbridge-replit.zip` into the Replit file pane
4. In the Shell:
   ```bash
   unzip trialbridge-replit.zip && rm trialbridge-replit.zip
   npm install
   ```
5. Continue from **step 4** of Route A (secrets onward)

**What the zip contains:** exactly the committed source — 77 files, 194 KB. It is produced with
`git archive`, so it *cannot* contain `node_modules`, `.next`, `.env` files or logs. It also does
**not** contain the `.git` folder, so the commit history is not carried across.

To put it under version control from Replit afterwards:

```bash
git init -b main
git add -A
git commit -m "TrialBridge"
git remote add origin https://github.com/YOURNAME/trialbridge.git
git push -u origin main
```

That gives you a repo, but the three existing commits are gone. If you care about the history,
use Route A instead.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Deployment hangs / "no open ports" | Server bound to localhost only | Run command must be `npm run start:replit` (it passes `-H 0.0.0.0`) |
| Site loads but every search 404s | Deployed as **Static** | Redeploy as **Autoscale** |
| No login prompt appears | `SITE_PASSWORD` not set on the *deployment* | Add it in the deployment's secrets, redeploy |
| `Invalid port` on start | An `${PORT}` shell expansion crept into the npm script | Use `next start -H 0.0.0.0`; Next reads `PORT` itself |
| Searches fail after a while | Nominatim rate limit | Set `GEOCODER_USER_AGENT`; self-host a geocoder for sustained traffic |
| Build fails on `.next/dev/types` | A dev server was running during build | Stop it, delete `.next`, rebuild |

---

## What your tester needs

- The `https://...replit.app` URL
- Username `beta` and the password
- [MANUAL_TEST_CHECKLIST.md](./MANUAL_TEST_CHECKLIST.md) for the ordinary website
- [START_HERE.md](./START_HERE.md) §2 if they are also testing the WebMCP tools

## Before the challenge judges see it

A password-gated site cannot be reviewed. Either remove `SITE_PASSWORD` from the deployment and
redeploy, or supply the credentials in the submission if the form allows it.
