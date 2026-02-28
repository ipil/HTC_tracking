"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton(): React.JSX.Element {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    if (busy) {
      return;
    }

    setBusy(true);
    const res = await fetch("/api/auth/logout", {
      method: "POST",
      cache: "no-store"
    });

    if (!res.ok) {
      setBusy(false);
      return;
    }

    router.replace("/login");
    router.refresh();
  }

  return (
    <button className="secondary" type="button" onClick={() => void handleLogout()} disabled={busy}>
      Logout
    </button>
  );
}
