import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

type DB = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

const g = globalThis as unknown as { __ondaroSql?: postgres.Sql; __ondaroDb?: DB };

function url() {
  const u = process.env.DATABASE_URL;
  if (!u) throw new Error("DATABASE_URL não configurada");
  return u;
}

/** Conexão do sistema (dona das tabelas). Use só para autenticação, plataforma e tokens públicos. */
export function systemDb(): DB {
  if (!g.__ondaroDb) {
    g.__ondaroSql = postgres(url(), {
      max: Number(process.env.DB_POOL_MAX || 10),
      idle_timeout: 20,
      // Poolers em modo transação (Supabase 6543) não suportam prepared statements.
      prepare: !/pooler|:6543/.test(url()),
      onnotice: () => {},
    });
    g.__ondaroDb = drizzle(g.__ondaroSql, { schema });
  }
  return g.__ondaroDb;
}

/**
 * Executa `fn` dentro de uma transação presa à empresa `tenantId`:
 * define app.tenant_id e troca para o papel ondaro_app, sujeito às políticas RLS.
 * Mesmo que uma consulta esqueça o filtro por tenant_id, o banco não devolve dados de outra empresa.
 */
export async function withTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!/^[0-9a-f-]{36}$/i.test(tenantId)) throw new Error("tenant inválido");
  return systemDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    await tx.execute(sql`set local role ondaro_app`);
    return fn(tx);
  });
}

export { schema };
