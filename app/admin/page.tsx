import Link from "next/link";

export default function AdminPage() {
  return (
    <main>
      <div className="panel">
        <h1>Admin Mode Enabled</h1>
        <p>Return to the main table to edit runner names and leg definitions.</p>
        <Link href="/">Back to Planner</Link>
      </div>
    </main>
  );
}
