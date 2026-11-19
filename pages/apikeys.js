import { useState, useEffect } from "react";

export default function Dashboard() {
  const [keys, setKeys] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (!d.user) window.location.href = "/login";
      else { setUser(d.user); loadKeys(); }
    });
  }, []);

  async function loadKeys() {
    const res = await fetch("/api/keys");
    const data = await res.json();
    if (data.keys) setKeys(data.keys);
  }

  async function createKey() {
    setError("");
    setLoading(true);
    const res = await fetch("/api/keys", { method: "POST" });
    const data = await res.json();
    if (res.ok) await loadKeys();
    else setError(data.error);
    setLoading(false);
  }

  async function deleteKey(id) {
    if (!confirm("Delete this API key? It will stop working immediately.")) return;
    await fetch("/api/keys", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    await loadKeys();
  }

  function copy(text, id) {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const BASE = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <>
      <style>{`
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        :root{--bg:#0d0d0f;--surface:#161618;--border:#2a2a2e;--accent:#7c6af7;--accent2:#4ade80;--text:#e8e8ec;--muted:#6b6b78;--mono:'JetBrains Mono',monospace;--sans:'Inter',sans-serif;--error:#ff5555}
        body{background:var(--bg);color:var(--text);font-family:var(--sans);min-height:100vh}
        a{color:var(--accent);text-decoration:none}
        h1{font-size:1.6rem;font-weight:600;margin-bottom:4px}
        h2{font-size:11px;font-weight:600;margin:28px 0 10px;font-family:var(--mono);letter-spacing:.08em;color:var(--muted);text-transform:uppercase}
        .nav{display:flex;justify-content:space-between;align-items:center;padding:14px 24px;border-bottom:1px solid var(--border)}
        .nav-logo{font-family:var(--mono);font-weight:700;color:var(--text)}
        .container{max-width:760px;margin:0 auto;padding:40px 24px 80px}
        .subtitle{color:var(--muted);font-size:14px;margin-bottom:28px}
        .card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px 24px;margin-bottom:12px}
        .btn{padding:9px 18px;border-radius:8px;border:none;background:var(--accent);color:#fff;font-family:var(--mono);font-size:12px;font-weight:700;cursor:pointer;transition:opacity .15s}
        .btn:hover{opacity:.85}
        .btn:disabled{opacity:.5;cursor:not-allowed}
        .btn-ghost{background:transparent;border:1px solid var(--border);color:var(--muted)}
        .btn-ghost:hover{border-color:var(--accent);color:var(--accent);opacity:1}
        .btn-danger{background:transparent;border:1px solid #ff555533;color:#ff5555;font-family:var(--mono);font-size:11px;padding:5px 10px;border-radius:6px;cursor:pointer;transition:all .15s}
        .btn-danger:hover{background:#ff555520}
        .key-row{display:flex;align-items:center;gap:10px;margin-top:4px}
        .key-val{flex:1;font-family:var(--mono);font-size:12px;color:var(--accent2);background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:8px 12px;word-break:break-all}
        .key-meta{font-size:11px;color:var(--muted);font-family:var(--mono);margin-bottom:6px}
        .error{color:var(--error);font-size:13px;margin-top:8px;font-family:var(--mono)}
        pre{background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:14px;font-family:var(--mono);font-size:12px;color:#a8a8b8;overflow-x:auto;line-height:1.7;white-space:pre-wrap;word-break:break-word;margin-bottom:16px}
        .method{font-family:var(--mono);font-size:11px;font-weight:700;padding:2px 7px;border-radius:4px;background:rgba(124,106,247,.15);color:var(--accent);display:inline-block;margin-right:8px}
        .method.get{background:rgba(74,222,128,.15);color:var(--accent2)}
        .path{font-family:var(--mono);font-size:13px}
        .endpoint-row{margin-bottom:6px}
        .desc{font-size:12px;color:var(--muted);margin:4px 0 10px}
        .step{display:flex;gap:10px;margin-bottom:10px;font-size:13px;color:var(--muted);line-height:1.6}
        .num{font-family:var(--mono);font-size:11px;font-weight:700;color:var(--accent);background:rgba(124,106,247,.12);border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px}
        .limit{font-size:11px;color:var(--muted);font-family:var(--mono);margin-top:20px}
        .nav-right{display:flex;align-items:center;gap:10px}
        .nav-email{font-family:var(--mono);font-size:12px;color:var(--muted)}
        .btn-logout{font-family:var(--mono);font-size:12px;color:var(--muted);background:transparent;border:1px solid var(--border);padding:6px 12px;border-radius:6px;cursor:pointer}
        .btn-logout:hover{border-color:var(--accent);color:var(--accent)}
        .empty{font-family:var(--mono);font-size:13px;color:var(--muted);padding:12px 0}
      `}</style>

      <nav className="nav">
        <a href="/" className="nav-logo">html2apk</a>
        <div className="nav-right">
          {user && <span className="nav-email">{user.email}</span>}
          <button className="btn-logout" onClick={logout}>Log out</button>
        </div>
      </nav>

      <div className="container">
        <h1>API Dashboard</h1>
        <p className="subtitle">Build APKs programmatically. Max 3 keys per account.</p>

        {/* Keys */}
        <h2>Your API Keys</h2>
        {keys.length === 0 && <p className="empty">No keys yet.</p>}
        {keys.map(k => (
          <div className="card" key={k.id}>
            <div className="key-meta">Created {new Date(k.created_at).toLocaleDateString()}</div>
            <div className="key-row">
              <div className="key-val">{k.key}</div>
              <button className="btn btn-ghost" style={{fontSize:11,padding:"6px 10px"}} onClick={() => copy(k.key, k.id)}>
                {copied === k.id ? "Copied!" : "Copy"}
              </button>
              <button className="btn-danger" onClick={() => deleteKey(k.id)}>Delete</button>
            </div>
          </div>
        ))}
        {error && <p className="error">{error}</p>}
        {keys.length < 3 && (
          <button className="btn" onClick={createKey} disabled={loading} style={{marginTop:8}}>
            {loading ? "Generating..." : "+ New API Key"}
          </button>
        )}

        {/* How agents use it */}
        <h2>How Agents Use This API</h2>
        <div className="card">
          <div className="step"><div className="num">1</div><div>Include your API key in every request as a Bearer token in the Authorization header.</div></div>
          <div className="step"><div className="num">2</div><div>POST your HTML and app config to start a build. You get a build ID back instantly.</div></div>
          <div className="step"><div className="num">3</div><div>Poll the status endpoint every 10–15 seconds until status is <code style={{fontFamily:"var(--mono)",color:"var(--accent2)"}}>done</code>.</div></div>
          <div className="step"><div className="num">4</div><div>Download the APK. The file is a zip — extract it to get the .apk inside.</div></div>
        </div>

        {/* Endpoints */}
        <h2>Endpoints</h2>
        <div className="card">
          <div className="endpoint-row"><span className="method">POST</span><span className="path">{BASE}/api/v1/builds</span></div>
          <p className="desc">Start a build. Returns immediately with a build ID.</p>
          <pre>{`curl -X POST ${BASE}/api/v1/builds \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "appName": "My App",
    "packageId": "com.example.myapp",
    "html": "<h1>Hello</h1>"
  }'

// 202 Response
{ "id": "build-uuid", "status": "queued" }`}</pre>

          <div className="endpoint-row"><span className="method get">GET</span><span className="path">{BASE}/api/v1/builds/:id</span></div>
          <p className="desc">Poll until status is <code style={{fontFamily:"var(--mono)"}}>done</code> or <code style={{fontFamily:"var(--mono)"}}>failed</code>.</p>
          <pre>{`curl ${BASE}/api/v1/builds/BUILD_ID \\
  -H "Authorization: Bearer YOUR_KEY"

// Response
{ "id": "...", "status": "queued|building|done|failed", "app_name": "My App" }`}</pre>

          <div className="endpoint-row"><span className="method get">GET</span><span className="path">{BASE}/api/v1/builds/:id/apk</span></div>
          <p className="desc">Download once status is done. Returns a zip containing the APK file.</p>
          <pre>{`curl -o app.zip ${BASE}/api/v1/builds/BUILD_ID/apk \\
  -H "Authorization: Bearer YOUR_KEY"

# Extract APK
unzip app.zip`}</pre>
        </div>

        {/* Body params */}
        <h2>Build Request Body</h2>
        <div className="card">
          <pre>{`{
  "appName":   "My App",           // Display name shown on device
  "packageId": "com.example.app",  // Reverse domain, e.g. com.yourname.appname
  "html":      "<h1>Hello</h1>",   // Full HTML string (max ~65 KB)
  "url":       "https://..."       // OR a URL to load in WebView (instead of html)
}`}</pre>
        </div>

        <p className="limit">Rate limit: 50 builds per key per 24 hours · Free · No credit card</p>
      </div>
    </>
  );
}
