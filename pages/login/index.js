import { useState } from "react";

export default function LoginPage() {
  const [mode, setMode] = useState("login");
  const [step, setStep] = useState("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  async function post(path, body) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json().then((data) => ({ ok: res.ok, data }));
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (mode === "login") {
      const { ok, data } = await post("/api/auth/login", { email, password });
      if (ok) window.location.href = "/dashboard";
      else setError(data.error);
    } else if (step === "form") {
      const { ok, data } = await post("/api/auth/signup", { email, password });
      if (ok) setStep("code");
      else setError(data.error);
    } else {
      const { ok, data } = await post("/api/auth/verify", { email, code });
      if (ok) window.location.href = "/dashboard";
      else setError(data.error);
    }
  }

  const inp = { display: "block", width: "100%", padding: 10, margin: "8px 0", boxSizing: "border-box" };
  const btn = { display: "block", width: "100%", padding: 10, margin: "8px 0", cursor: "pointer" };
  const link = { background: "none", border: "none", color: "#06c", cursor: "pointer", padding: 0 };

  return (
    <main style={{ maxWidth: 380, margin: "60px auto", fontFamily: "sans-serif" }}>
      <h1>{mode === "login" ? "Log in" : "Sign up"}</h1>
      <form onSubmit={submit}>
        {!(mode === "signup" && step === "code") && (
          <>
            <input type="email" placeholder="Email" value={email}
              onChange={(e) => setEmail(e.target.value)} required style={inp} />
            <input type="password" placeholder="Password (8+ characters)" value={password}
              onChange={(e) => setPassword(e.target.value)} required minLength={8} style={inp} />
          </>
        )}
        {mode === "signup" && step === "code" && (
          <>
            <p>Enter the 6-digit code sent to {email}.</p>
            <input placeholder="000000" value={code}
              onChange={(e) => setCode(e.target.value)} required maxLength={6} style={inp} />
          </>
        )}
        {error && <p style={{ color: "crimson" }}>{error}</p>}
        <button type="submit" style={btn}>
          {mode === "login" ? "Log in" : step === "form" ? "Send code" : "Verify"}
        </button>
      </form>
      <p>
        <button onClick={() => { setMode(mode === "login" ? "signup" : "login"); setStep("form"); setError(""); }} style={link}>
          {mode === "login" ? "No account? Sign up" : "Have an account? Log in"}
        </button>
      </p>
    </main>
  );
}
