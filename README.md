# html2apk-web

Convert any HTML file into a signed Android APK — right from the browser.

**Stack:** Next.js (Vercel) → GitHub Actions (build) → APK download

---

## Setup

### 1. GitHub

- Push this repo to GitHub (e.g. `Hecker01/html2apk-web`)
- Create a **Personal Access Token** with `repo` + `workflow` scopes
  - GitHub → Settings → Developer Settings → Personal access tokens → Fine-grained

### 2. Vercel

- Import the repo into Vercel
- Add these **Environment Variables** in Vercel project settings:

| Key | Value |
|-----|-------|
| `GH_TOKEN` | Your GitHub PAT |
| `REPO_OWNER` | `Hecker01` |
| `REPO_NAME` | `html2apk-web` |

### 3. Deploy

Push to `main` — Vercel auto-deploys.

---

## How it works

1. User uploads HTML + fills app name/package name
2. Vercel `/api/build` triggers `build-apk.yml` via GitHub Actions `workflow_dispatch`
3. GitHub Actions: installs Android SDK → runs `builder/build.py` → uploads APK as artifact
4. Vercel `/api/status` polls the run until complete
5. Vercel `/api/download` proxies the artifact zip to the user

---

## Local dev

```bash
cp .env.local.example .env.local
# fill in .env.local
npm install
npm run dev
```
