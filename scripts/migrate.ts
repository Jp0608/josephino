import { runMigrations } from "../src/db/migrate";
runMigrations()
  .then(() => { console.log("migrações aplicadas"); process.exit(0); })
  .catch((e) => { console.error(e); process.exit(1); });
