"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });

    if (!res.ok) {
      setError("Invalid password");
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <main>
      <div className="panel" style={{ maxWidth: 480, margin: "3rem auto" }}>
        <h1>Site Login</h1>
        <p className="muted">Enter the site password to access race planning.</p>
        <form onSubmit={onSubmit} style={{ display: "grid", gap: "0.6rem" }}>
          <input
            type="password"
            placeholder="Password"
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
