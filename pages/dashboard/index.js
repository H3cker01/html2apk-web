import { useState } from "react";

export default function Dashboard() {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function createKey() {
    setError("");
    setKey("");
    const res = await fetch("/api/keys", { method: "POST" });
    const data = await res.json();
    if (res.ok) setKey(data.key);
    else if (res.status === 401) window.location.href = "/login";
    else setError(data.error);
  }

  function copy(text) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const BASE = typeof window !== "undefined" ? window.location.origin : "https://html2apk-web-h3cker01s-projects.vercel.app";

  return (
    <>
      <style>{`
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        :root{--bg:#0d0d0f;--surface:#161618;--border:#2a2a2e;--accent:#7c6af7;--accent2:#4ade80;--text:#e8e8ec;--muted:#6b6b78;--mono:'JetBrains Mono',monospace;--sans:'Inter',sans-serif;--error:#ff5555}
        body{background:var(--bg);color:var(--text);font-family:var(--sans);min-height:100vh}
        a{color:var(--accent);text-decoration:none}
        h1{font-size:1.8rem;font-weight:600;margin-bottom:6px}
        h2{font-size:1rem;font-weight:600;margin:32px 0 12px;font-family:var(--mono);letter-spacing:.06em;color:var(--muted);text-transform:uppercase;font-size:11px}
        .container{max-width:720px;margin:0 auto;padding:48px 24px 80px}
        .nav{display:flex;justify-content:space-between;align-items:center;padding:16px 24px;border-bottom:1px solid var(--border)}
        .nav-logo{font-family:var(--mono);font-weight:700;color:var(--text)}
        .nav-link{font-size:13px;color:var(--muted)}
        .subtitle{color:var(--muted);font-size:14px;margin-bottom:32px}
        .card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:24px;margin-bottom:16px}
        .btn{padding:10px 20px;border-radius:8px;border:none;background:var(--accent);color:#fff;font-family:var(--mono);font-size:13px;font-weight:700;cursor:pointer;transition:opacity .15s}
        .btn:hover{opacity:.85}
        .btn-sm{padding:6px 14px;font-size:12px}
        .btn-ghost{background:transparent;border:1px solid var(--border);color:var(--muted)}
        .btn-ghost:hover{border-color:var(--accent);color:var(--accent);opacity:1}
        .key-box{background:var(--bg);border:1px solid var(--accent);border-radius:8px;padding:14px 16px;font-family:var(--mono);font-size:13px;color:var(--accent2);word-break:break-all;margin:12px 0}
        .key-row{display:flex;align-items:flex-start;gap:10px}
        .key-row .key-box{flex:1;margin:0}
        .warn{font-size:12px;color:var(--muted);margin-top:8px;font-family:var(--mono)}
        .warn span{color:#f59e0b}
        .error{color:var(--error);font-size:13px;margin-top:8px;font-family:var(--mono)}
        pre{background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:16px;font-family:var(--mono);font-size:12px;color:#a8a8b8;overflow-x:auto;line-height:1.7;white-space:pre-wrap;word-break:break-word}
        .endpoint{display:flex;align-items:center;gap:10px;margin-bottom:8px}
        .method{font-family:var(--mono);font-size:11px;font-weight:700;padding:3px 8px;border-radius:4px;background:rgba(124,106,247,.15);color:var(--accent)}
        .method.get{background:rgba(74,222,128,.15);color:var(--accent2)}
        .path{font-family:var(--mono);font-size:13px;color:var(--text)}
        .desc{font-size:12px;color:var(--muted);margin-bottom:16px}
        .step{display:flex;gap:12px;margin-bottom:12px;font-size:13px;color:var(--muted);line-height:1.6}
        .step-num{font-family:var(--mono);font-size:11px;font-weight:700;color:var(--accent);background:rgba(124,106,247,.12);border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px}
      `}</style>

      <nav className="nav">
        <a href="/" className="nav-logo">html2apk</a>
        <a href="/login" className="nav-link">Login / Sign up</a>
      </nav>

      <div className="container">
        <h1>API Access</h1>
        <p className="subtitle">Generate an API key to build APKs programmatically — perfect for AI agents and automation.</p>

        {/* Key generation */}
        <div className="card">
          <h2>Your API Key</h2>
          <p style={{fontSize:13,color:"var(--muted)",marginBottom:16}}>You must be logged in. The key is shown once — save it immediately.</p>
          <button className="btn" onClick={createKey}>Generate API Key</button>
          {error && <p className="error">{error}</p>}
          {key && (
            <>
              <div className="key-row" style={{marginTop:14}}>
                <div className="key-box">{key}</div>
                <button className="btn btn-sm btn-ghost" onClick={() => copy(key)}>{copied ? "Copied!" : "Copy"}</button>
              </div>
              <p className="warn"><span>⚠ Save this now.</span> It won't be shown again.</p>
            </>
          )}
        </div>

        {/* How it works */}
        <div className="card">
          <h2>How It Works</h2>
          <div className="step"><div className="step-num">1</div><div>Sign up at <a href="/login">/login</a>, then come back here and generate an API key.</div></div>
          <div className="step"><div className="step-num">2</div><div>POST your HTML and app details to <code style={{fontFamily:"var(--mono)",color:"var(--accent2)"}}>POST /api/v1/builds</code> with your key.</div></div>
          <div className="step"><div className="step-num">3</div><div>Poll <code style={{fontFamily:"var(--mono)",color:"var(--accent2)"}}>GET /api/v1/builds/:id</code> until status is <code style={{fontFamily:"var(--mono)",color:"var(--accent2)"}}>done</code>.</div></div>
          <div className="step"><div className="step-num">4</div><div>Download your APK from <code style={{fontFamily:"var(--mono)",color:"var(--accent2)"}}>GET /api/v1/builds/:id/apk</code>.</div></div>
        </div>

        {/* Endpoints */}
        <div className="card">
          <h2>Endpoints</h2>

          <div className="endpoint"><span className="method">POST</span><span className="path">/api/v1/builds</span></div>
          <p className="desc">Start a build. Returns a build ID immediately.</p>
          <pre>{`curl -X POST ${BASE}/api/v1/builds \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "appName": "My App",
    "packageId": "com.example.myapp",
    "html": "<h1>Hello World</h1>"
  }'

// Response
{ "id": "build-uuid", "status": "queued" }`}</pre>

          <div className="endpoint" style={{marginTop:24}}><span className="method get">GET</span><span className="path">/api/v1/builds/:id</span></div>
          <p className="desc">Check build status. Poll every 10–15 seconds.</p>
          <pre>{`curl ${BASE}/api/v1/builds/BUILD_ID \\
  -H "Authorization: Bearer YOUR_KEY"

// Response
{ "id": "...", "status": "queued|building|done|failed", "app_name": "My App" }`}</pre>

          <div className="endpoint" style={{marginTop:24}}><span className="method get">GET</span><span className="path">/api/v1/builds/:id/apk</span></div>
          <p className="desc">Download the APK once status is <code style={{fontFamily:"var(--mono)"}}>done</code>. Returns a zip containing the APK.</p>
          <pre>{`curl -o app.zip ${BASE}/api/v1/builds/BUILD_ID/apk \\
  -H "Authorization: Bearer YOUR_KEY"`}</pre>
        </div>

        {/* Body params */}
        <div className="card">
          <h2>Request Body (POST /api/v1/builds)</h2>
          <pre>{`{
  "appName":   "My App",          // required — display name
  "packageId": "com.me.myapp",    // required — reverse domain format
  "html":      "<h1>Hi</h1>",     // required if no url
  "url":       "https://..."      // required if no html — loads in WebView
}`}</pre>
        </div>

        <p style={{fontSize:12,color:"var(--muted)",fontFamily:"var(--mono)"}}>Limit: 50 builds per key per 24 hours. Free, no credit card.</p>
      </div>
    </>
  );
}
