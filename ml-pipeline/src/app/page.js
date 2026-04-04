// src/app/page.js
// Landing page — redirects to /dashboard if logged in, else shows sign-in CTA
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import jwt from "jsonwebtoken";

export default async function LandingPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (token) {
    try {
      jwt.verify(token, process.env.JWT_SECRET);
      redirect("/dashboard");
    } catch {
      // expired/invalid — show landing
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg-primary)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      {/* Glow orb */}
      <div
        style={{
          position: "absolute",
          top: "20%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "600px",
          height: "600px",
          background: "radial-gradient(circle, rgba(108,71,255,0.12) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative", maxWidth: "680px" }}>
        {/* Badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            background: "rgba(108,71,255,0.12)",
            border: "1px solid rgba(108,71,255,0.3)",
            borderRadius: "999px",
            padding: "0.3rem 0.9rem",
            fontSize: "0.78rem",
            color: "var(--accent-light)",
            fontWeight: 600,
            marginBottom: "1.5rem",
            letterSpacing: "0.05em",
          }}
        >
          <span>⚡</span> AGNOSTIC ML INFERENCE SAAS
        </div>

        <h1
          style={{
            fontSize: "clamp(2.5rem, 6vw, 4rem)",
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: "-0.03em",
            marginBottom: "1.25rem",
            background: "linear-gradient(135deg, #f1f0ff 0%, #8b6dff 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Run Any ML Model.
          <br />No Infrastructure.
        </h1>

        <p
          style={{
            fontSize: "1.1rem",
            color: "var(--text-secondary)",
            lineHeight: 1.7,
            marginBottom: "2.5rem",
            maxWidth: "520px",
            margin: "0 auto 2.5rem",
          }}
        >
          Predict-Xplore lets you register any Docker-based ML model, chain them into
          pipelines, and trigger inference — all from one clean UI backed by Celery workers.
        </p>

        <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/auth/signup" className="btn btn-primary" style={{ padding: "0.75rem 2rem", fontSize: "1rem" }}>
            Get Started Free
          </Link>
          <Link href="/auth/login" className="btn btn-secondary" style={{ padding: "0.75rem 2rem", fontSize: "1rem" }}>
            Sign In
          </Link>
        </div>

        {/* Feature pills */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.75rem",
            justifyContent: "center",
            marginTop: "4rem",
          }}
        >
          {[
            "Docker-native execution",
            "Celery + Redis task queue",
            "Pipeline chaining",
            "Real-time logs",
            "Shared local storage",
          ].map((f) => (
            <span
              key={f}
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                padding: "0.4rem 0.9rem",
                fontSize: "0.8rem",
                color: "var(--text-secondary)",
              }}
            >
              {f}
            </span>
          ))}
        </div>
      </div>
    </main>
  );
}
