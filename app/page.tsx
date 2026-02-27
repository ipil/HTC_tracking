import Link from "next/link";
import AccessIndicator, { getAccessLevelFromCookies } from "@/components/AccessIndicator";
import LogoutButton from "@/components/LogoutButton";
import RunnersPanel from "@/components/RunnersPanel";
import TableClient from "@/components/TableClient";
import { getRunnersData } from "@/lib/runnersData";
import { getTableData } from "@/lib/tableData";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  const [data, accessLevel, runners] = await Promise.all([
    getTableData(),
    getAccessLevelFromCookies(),
    getRunnersData()
  ]);
  const isAdmin = accessLevel === "admin";
  const isLoggedIn = accessLevel === "team-editor" || accessLevel === "admin";
  const canEdit = accessLevel !== "viewer";

  return (
    <main>
      <div style={{ display: "grid", gap: "1rem" }}>
        <AccessIndicator />
        <header className="panel" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1>Hood to Coast Relay Planner</h1>
            <p className="muted">36-leg collaborative planning table with relay timing logic.</p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            {accessLevel === "admin" ? <span>Admin Mode</span> : null}
            {accessLevel === "team-editor" ? <span>Team Editor Mode</span> : null}
            {!isAdmin ? <Link href="/admin/login">Admin login</Link> : null}
            {isLoggedIn ? <LogoutButton /> : null}
          </div>
        </header>

        {isAdmin ? <RunnersPanel initialRunners={runners} /> : null}
        <TableClient initialData={data} isAdmin={isAdmin} canEdit={canEdit} />
      </div>
    </main>
  );
}
