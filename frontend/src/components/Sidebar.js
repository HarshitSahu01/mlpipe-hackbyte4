// src/components/Sidebar.js
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "⬡" },
  { href: "/models", label: "Models", icon: "◈" },
  { href: "/pipelines", label: "Pipelines", icon: "⟳" },
  { href: "/tasks", label: "Tasks", icon: "⚡" },
];

export default function Sidebar({ user }) {
  const pathname = usePathname();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  return (
    <aside
      style={{
        width: "220px",
        minHeight: "100vh",
        background: "var(--bg-secondary)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        padding: "1.5rem 1rem",
        flexShrink: 0,
      }}
    >
      {/* Logo */}
      <div style={{ marginBottom: "2rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <img src="/logo.jpg" alt="Logo" style={{ width: "36px", height: "36px", borderRadius: "8px", objectFit: "cover" }} />
        <div>
          <div
            style={{
              fontSize: "1.1rem",
              fontWeight: 700,
              color: "var(--accent-light)",
              letterSpacing: "-0.02em",
            }}
          >
            ML <span style={{ color: "var(--text-primary)" }}>Pipeline</span>
          </div>
          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "2px" }}>
            ML Inference SaaS
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-link${pathname.startsWith(item.href) ? " active" : ""}`}
          >
            <span style={{ fontSize: "1rem", lineHeight: 1 }}>{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      {/* User */}
      {user && (
        <div
          style={{
            borderTop: "1px solid var(--border)",
            paddingTop: "1rem",
            marginTop: "1rem",
          }}
        >
          <div
            style={{
              fontSize: "0.8rem",
              color: "var(--text-secondary)",
              marginBottom: "0.25rem",
              fontWeight: 600,
            }}
          >
            {user.name}
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
            {user.email}
          </div>
          <button onClick={handleLogout} className="btn btn-secondary" style={{ width: "100%", fontSize: "0.8rem" }}>
            Sign out
          </button>
        </div>
      )}
    </aside>
  );
}
