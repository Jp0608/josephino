/** Ao subir o servidor (runtime Node): aplica as migrações pendentes e garante os planos iniciais. */
export async function register() {
  // Na Vercel as migrações rodam no build (vercel.json), não a cada função que sobe.
  if (process.env.NEXT_RUNTIME === "nodejs" && !process.env.VERCEL) {
    await import("./instrumentation-node");
  }
}
