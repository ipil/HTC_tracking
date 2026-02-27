"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");

    const res = await fetch("/api/auth/admin-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });

    if (!res.ok) {
      setError("Invalid admin password");
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <main>
      <div className="panel" style={{ maxWidth: 480, margin: "3rem auto" }}>
        <h1>Admin Login</h1>
        <p className="muted">Unlock admin editing for runner names and leg metadata.</p>
        <form onSubmit={onSubmit} style={{ display: "grid", gap: "0.6rem" }}>
          <input
            type="password"
            placeholder="Admin password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit">Login</button>
          {error ? <div className="warn">{error}</div> : null}
        </form>
      </div>
    </main>
  );
}
