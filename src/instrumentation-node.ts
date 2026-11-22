import { runMigrations } from "./db/migrate";

if (process.env.DATABASE_URL) {
  await runMigrations();
  console.log("[ondaro] banco de dados atualizado");
}
