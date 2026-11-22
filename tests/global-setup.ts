import postgres from "postgres";

/** Recria o banco de teste do zero e aplica as migrações. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL || "postgres://ondaro:ondaro@localhost:5432/ondaro_test";
  const admin = postgres(url, { max: 1, onnotice: () => {} });
  await admin.unsafe("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await admin.end();
  process.env.DATABASE_URL = url;
  const { runMigrations } = await import("../src/db/migrate");
  await runMigrations();
  await (globalThis as unknown as { __ondaroSql?: { end: () => Promise<void> } }).__ondaroSql?.end();
}
