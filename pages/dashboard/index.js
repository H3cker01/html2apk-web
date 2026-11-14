import { useState } from "react";

export default function Dashboard() {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");

  async function createKey() {
    setError("");
    const res = await fetch("/api/keys", { method: "POST" });
    const data = await res.json();
    if (res.ok) setKey(data.key);
    else setError(data.error);
  }

  return (
    <main style={{ maxWidth: 600, margin: "60px auto", fontFamily: "sans-serif" }}>
      <h1>html2apk API</h1>
      <button onClick={createKey} style={{ padding: 10, cursor: "pointer" }}>Create API key</button>
      {key && (
        <>
          <p>Copy now. This key will not be shown again:</p>
          <code style={{ display: "block", wordBreak: "break-all", padding: 10, background: "#f4f4f4" }}>{key}</code>
        </>
      )}
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      <h2>Usage</h2>
      <pre style={{ background: "#f4f4f4", padding: 12, overflowX: "auto" }}>{`curl -X POST https://html2apk-web-h3cker01s-projects.vercel.app/api/v1/builds \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"appName":"My App","packageId":"com.me.app","html":"<h1>Hi</h1>"}'`}</pre>
    </main>
  );
}
