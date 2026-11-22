/** Ao subir o servidor (runtime Node): aplica as migrações pendentes e garante os planos iniciais. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
