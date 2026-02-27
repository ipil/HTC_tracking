import Link from "next/link";
import AccessIndicator, { getAccessLevelFromCookies } from "@/components/AccessIndicator";
import TableClient from "@/components/TableClient";
import { getTableData } from "@/lib/tableData";
import { isAdminAuthenticated } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  const [data, isAdmin, accessLevel] = await Promise.all([
    getTableData(),
    isAdminAuthenticated(),
    getAccessLevelFromCookies()
  ]);
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
            {isAdmin ? <span>Admin mode</span> : <Link href="/admin/login">Admin login</Link>}
            <Link className="secondary" href="/api/auth/logout">
              Logout
            </Link>
          </div>
        </header>

        <TableClient initialData={data} isAdmin={isAdmin} canEdit={canEdit} />
      </div>
    </main>
  );
}
