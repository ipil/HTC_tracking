import { cookies } from "next/headers";

export type AccessLevel = "viewer" | "team-editor" | "admin";

export async function getAccessLevelFromCookies(): Promise<AccessLevel> {
  const cookieStore = await cookies();
  const hasAdmin = Boolean(cookieStore.get("admin_auth")?.value);
  const hasSite = Boolean(cookieStore.get("site_auth")?.value);

  if (hasAdmin) {
    return "admin";
  }
  if (hasSite) {
    return "team-editor";
  }
  return "viewer";
}

export default async function AccessIndicator(): Promise<React.JSX.Element> {
  const accessLevel = await getAccessLevelFromCookies();

  if (accessLevel === "admin") {
    return (
      <div className="panel" style={{ borderColor: "#7f2430", backgroundColor: "#fff3f5", padding: "0.6rem 0.8rem" }}>
        <strong>Admin</strong> — full access
      </div>
    );
  }

  if (accessLevel === "team-editor") {
    return (
      <div className="panel" style={{ borderColor: "#1f5134", backgroundColor: "#eef9f0", padding: "0.6rem 0.8rem" }}>
        <strong>Team Editor</strong> — you can edit paces and times
      </div>
    );
  }

  return (
    <div className="panel" style={{ borderColor: "#7b6a1e", backgroundColor: "#fff8dd", padding: "0.6rem 0.8rem" }}>
      <strong>Viewing only</strong> — ask for the password to edit
    </div>
  );
}
