// src/app/auth/login/page.js
"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GoogleLogin } from "@react-oauth/google";

export default function LoginPage() {
  <GoogleLogin
    onSuccess={async (res) => {
      await fetch("/api/auth/google", {
        method: "POST",
        body: JSON.stringify({
          credential: res.credential,
        }),
      });

      router.push("/dashboard");
    }}
  />;
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
      } else {
        router.push("/dashboard");
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  const handleGithubLogin = () => {
    window.location.href = `https://github.com/login/oauth/authorize?client_id=${process.env.NEXT_PUBLIC_GITHUB_ID}`;
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-primary)",
        padding: "1rem",
      }}
    >
      <div style={{ width: "100%", maxWidth: "420px" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <img src="/logo.jpg" alt="Logo" style={{ width: "56px", height: "56px", borderRadius: "12px", margin: "0 auto 1rem auto", display: "block" }} />
          <div
            style={{
              fontSize: "1.5rem",
              fontWeight: 800,
              color: "var(--accent-light)",
            }}
          >
            <span>ML </span><span style={{ color: "var(--text-primary)" }}>Pipeline</span>
          </div>
          <div
            style={{
              color: "var(--text-muted)",
              fontSize: "0.85rem",
              marginTop: "0.25rem",
            }}
          >
            Sign in to your account
          </div>
        </div>

        <div className="card">
          <form
            onSubmit={handleSubmit}
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                id="login-email"
                autoComplete="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                type="password"
                id="login-password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </div>

            {error && (
              <div
                style={{
                  background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.3)",
                  borderRadius: "8px",
                  padding: "0.65rem 0.9rem",
                  fontSize: "0.85rem",
                  color: "var(--danger)",
                }}
              >
                {error}
              </div>
            )}

            <button
              id="login-submit"
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ marginTop: "0.5rem", width: "100%", padding: "0.75rem" }}
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <div className="mt-6 flex gap-3">
            {/* Google */}
            <div className="flex-1">
              <GoogleLogin
                width="50%"
                onSuccess={async (res) => {
                  await fetch("/api/auth/google", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      credential: res.credential,
                    }),
                  });

                  router.push("/dashboard");
                }}
                onError={() => {
                  setError("Google login failed");
                }}
              />
            </div>

            {/* GitHub */}
            <button
              onClick={handleGithubLogin}
              className="flex-1 flex items-center justify-center gap-2 border border-border rounded-lg px-3 py-1.5 text-sm font-medium bg-background hover:bg-muted transition-colors"
            >
              {/* GitHub Icon */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                className="w-4 h-4"
                fill="currentColor"
              >
                <path d="M12 0C5.37 0 0 5.37 0 12a12 12 0 008.21 11.44c.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.38-1.34-1.75-1.34-1.75-1.1-.75.08-.74.08-.74 1.22.09 1.86 1.25 1.86 1.25 1.08 1.85 2.84 1.32 3.53 1.01.11-.78.42-1.32.76-1.62-2.67-.3-5.48-1.34-5.48-5.95 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.17 0 0 1.01-.32 3.3 1.23a11.4 11.4 0 016 0c2.28-1.55 3.3-1.23 3.3-1.23.66 1.65.25 2.87.12 3.17.77.84 1.24 1.91 1.24 3.22 0 4.62-2.81 5.65-5.49 5.95.43.37.82 1.1.82 2.22v3.29c0 .32.22.7.83.58A12 12 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
              GitHub
            </button>
          </div>

          <hr className="divider" />
          <p
            style={{
              textAlign: "center",
              fontSize: "0.85rem",
              color: "var(--text-muted)",
            }}
          >
            No account?{" "}
            <Link
              href="/auth/signup"
              style={{ color: "var(--accent-light)", fontWeight: 600 }}
            >
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
