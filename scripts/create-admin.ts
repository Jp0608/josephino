/**
 * Cria (ou redefine a senha de) uma conta de administrador da plataforma — sem vínculo com empresa.
 * O acesso a /admin vem de PLATFORM_ADMIN_EMAILS; este script só cria o usuário.
 *
 * Uso:
 *   set -a; . ./.env.local; set +a
 *   ADMIN_PASSWORD='SenhaForte123' npx tsx scripts/create-admin.ts [email]
 *   npx tsx scripts/create-admin.ts admin@ondaro.dev 'SenhaForte123'
 */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { systemDb } from "../src/db";
import { users } from "../src/db/schema";

async function main() {
  const email = (process.argv[2] || process.env.ADMIN_EMAIL || "admin@ondaro.dev").trim().toLowerCase();
  const password = process.argv[3] || process.env.ADMIN_PASSWORD || "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("E-mail inválido.");
  // Mesma regra de validatePassword (src/server/auth.ts).
  if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/\d/.test(password))
    throw new Error("Informe a senha (mín. 8 caracteres, com letras e números) via ADMIN_PASSWORD ou 2º argumento.");
  const admins = (process.env.PLATFORM_ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!admins.includes(email)) console.warn(`Aviso: ${email} não está em PLATFORM_ADMIN_EMAILS — o login será recusado até incluí-lo.`);

  const db = systemDb();
  const passwordHash = await bcrypt.hash(password, 11);
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    await db.update(users).set({ passwordHash, mustChangePassword: false, updatedAt: new Date() }).where(eq(users.id, existing.id));
    console.log(`Senha redefinida para ${email}.`);
  } else {
    await db.insert(users).values({ email, name: "Administrador Ondaro", passwordHash, mustChangePassword: false });
    console.log(`Administrador ${email} criado (sem empresa). Entre em /entrar para acessar /admin.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
