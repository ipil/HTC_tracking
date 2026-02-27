"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton(): React.JSX.Element {
  const router = useRouter();

  async function handleLogout() {
    const res = await fetch("/api/auth/logout", {
      method: "POST"
    });

    if (!res.ok) {
      return;
    }

    router.refresh();
  }

  return (
    <button className="secondary" type="button" onClick={handleLogout}>
      Logout
    </button>
  );
}
