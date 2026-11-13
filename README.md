# html2apk

Free HTML → APK converter with a web UI and a public API.

## Setup

1. Create a Vercel Postgres database and run `schema.sql` in it.
2. Copy `.env.example` values into Vercel project env vars.
3. Create a GitHub OAuth app. Callback URL: `${APP_URL}/api/auth/github`.
4. Create a fine-grained GitHub token scoped to this repo (Actions: read/write, Contents: read). Store it as `GITHUB_DISPATCH_TOKEN`.
5. Verify a sender domain in Resend and set `MAIL_FROM`.
6. Deploy to Vercel.

## Repo layout

```
app/
  api/auth/          signup, verify, login, github
  api/keys/          create API key (session required)
  api/v1/builds/     POST create build, GET [id] status, GET [id]/apk download
  login/             email/password + GitHub login page
  dashboard/         create API key and usage examples
lib/auth.js          sessions, password hashing, API key lookup
schema.sql           database tables
scripts/generate_project.py   builds the Android project from HTML
.github/workflows/build-apk.yml   APK build workflow (runs on workflow_dispatch)
```

## API

All `/api/v1` requests need `Authorization: Bearer <key>`.

- `POST /api/v1/builds`: body `{ "appName", "packageId", "html" }` or `{ "appName", "packageId", "url" }`. Returns `202` with `id`.
- `GET /api/v1/builds/{id}`: returns status.
- `GET /api/v1/builds/{id}/apk`: returns `202 building` until ready, then a zip containing the APK.

Limit: 50 builds per key per 24 hours.

## Known limits

- The workflow passes HTML as a workflow input, which GitHub caps at about 65 KB. Larger projects need an upload step (not included).
- `url` mode loads the remote site in a redirect page, so it needs internet access on the device.
- Signed release APKs are not produced. Output is a debug build.
- The workflow must run from `main` and the repo must stay public for free Actions minutes.
