// Para migrar, prefira a conexão direta (sem pooler) quando existir.
if (process.env.DATABASE_URL_UNPOOLED) process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
import { runMigrations } from "../src/db/migrate";
runMigrations()
  .then(() => { console.log("migrações aplicadas"); process.exit(0); })
  .catch((e) => { console.error(e); process.exit(1); });
