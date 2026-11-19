# html2apk

Free HTML → APK converter with a web UI and a public API.

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
