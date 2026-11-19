import { useState } from "react";

export default function LoginPage() {
  const [mode, setMode] = useState("login"); // login | signup | forgot | reset
  const [step, setStep] = useState("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
    if (loading) return;
    setLoading(true);
    setError("");

    if (mode === "login") {
      const { ok, data } = await post("/api/auth/login", { email, password });
      if (ok) window.location.href = "/apikeys";
      else setError(data.error);

    } else if (mode === "signup") {
      if (step === "form") {
        const { ok, data } = await post("/api/auth/signup", { email, password });
        if (ok) setStep("code");
        else setError(data.error);
      } else {
        const { ok, data } = await post("/api/auth/verify", { email, code });
        if (ok) window.location.href = "/apikeys";
        else setError(data.error);
      }

    } else if (mode === "forgot") {
      if (step === "form") {
        const { ok, data } = await post("/api/auth/forgot", { email });
        if (ok) setStep("code");
        else setError(data.error);
      } else {
        const { ok, data } = await post("/api/auth/reset", { email, code, password });
        if (ok) window.location.href = "/apikeys";
        else setError(data.error);
      }
    }

    setLoading(false);
  }

  function switchMode(m) {
    setMode(m);
    setStep("form");
    setError("");
    setCode("");
    setPassword("");
  }

  const inp = { display: "block", width: "100%", padding: 10, margin: "8px 0", boxSizing: "border-box", fontSize: 14 };
  const btn = { display: "block", width: "100%", padding: 10, margin: "8px 0", cursor: "pointer", fontSize: 14, opacity: loading ? 0.6 : 1 };
  const link = { background: "none", border: "none", color: "#7c6af7", cursor: "pointer", padding: 0, fontSize: 13 };

  const title = mode === "login" ? "Log in" : mode === "signup" ? "Sign up" : "Reset password";

  return (
    <main style={{ maxWidth: 380, margin: "60px auto", fontFamily: "sans-serif", padding: "0 16px" }}>
      <a href="/" style={{ color: "#7c6af7", fontSize: 13, textDecoration: "none" }}>← Back</a>
      <h1 style={{ margin: "16px 0 4px" }}>{title}</h1>

      <form onSubmit={submit}>
        {/* Email field — always shown except signup code step */}
        {!(mode === "signup" && step === "code") && (
          <input type="email" placeholder="Email" value={email}
            onChange={(e) => setEmail(e.target.value)} required style={inp} />
        )}

        {/* Password — login, signup form, forgot reset step */}
        {(mode === "login" || (mode === "signup" && step === "form") || (mode === "forgot" && step === "code")) && (
          <input type="password"
            placeholder={mode === "forgot" && step === "code" ? "New password (8+ characters)" : "Password (8+ characters)"}
            value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} style={inp} />
        )}

        {/* Code input */}
        {((mode === "signup" && step === "code") || (mode === "forgot" && step === "code")) && (
          <>
            <p style={{ fontSize: 13, color: "#666", margin: "8px 0" }}>
              {mode === "signup" ? `Enter the 6-digit code sent to ${email}.` : `Enter the reset code sent to ${email}, then set a new password.`}
            </p>
            <input placeholder="6-digit code" value={code}
              onChange={(e) => setCode(e.target.value)} required maxLength={6} style={inp} />
          </>
        )}

        {error && <p style={{ color: "crimson", fontSize: 13, margin: "6px 0" }}>{error}</p>}

        <button type="submit" style={btn} disabled={loading}>
          {loading ? "Please wait..." :
            mode === "login" ? "Log in" :
            mode === "signup" ? (step === "form" ? "Send code" : "Verify & sign up") :
            step === "form" ? "Send reset code" : "Reset password"}
        </button>
      </form>

      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
        {mode === "login" && (
          <>
            <button onClick={() => switchMode("signup")} style={link}>No account? Sign up</button>
            <button onClick={() => switchMode("forgot")} style={link}>Forgot password?</button>
          </>
        )}
        {mode === "signup" && <button onClick={() => switchMode("login")} style={link}>Have an account? Log in</button>}
        {mode === "forgot" && <button onClick={() => switchMode("login")} style={link}>Back to log in</button>}
      </div>
    </main>
  );
}
