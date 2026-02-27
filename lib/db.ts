import { Pool, neon } from "@neondatabase/serverless";

type RowObject = Record<string, unknown>;

type SqlResult<TRow extends RowObject> = {
  rows: TRow[];
};

type SqlTag = {
  <TRow extends RowObject = RowObject>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<SqlResult<TRow>>;
  query<TRow extends RowObject = RowObject>(
    text: string,
    values?: unknown[]
  ): Promise<SqlResult<TRow>>;
};

function getConnectionString(): string {
  const value = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
  if (!value) {
    throw new Error("Missing POSTGRES_URL or DATABASE_URL");
  }
  return value;
}

const connectionString = getConnectionString();
const neonSql = neon(connectionString);
const pool = new Pool({ connectionString });

const sql = (async <TRow extends RowObject = RowObject>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<SqlResult<TRow>> => {
  const rows = await (neonSql as unknown as (...args: unknown[]) => Promise<TRow[]>)(
    strings,
    ...values
  );
  return { rows };
}) as SqlTag;

sql.query = async <TRow extends RowObject = RowObject>(
  text: string,
  values: unknown[] = []
): Promise<SqlResult<TRow>> => {
  const result = await pool.query<TRow>(text, values);
  return { rows: result.rows };
};

export { sql };
