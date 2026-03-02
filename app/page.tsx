import { getAccessLevelFromCookies } from "@/components/AccessIndicator";
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
        <TableClient
          initialData={data}
          initialRunners={runners}
          isAdmin={isAdmin}
          isLoggedIn={isLoggedIn}
          canEdit={canEdit}
          accessLevel={accessLevel}
        />
      </div>
    </main>
  );
}
