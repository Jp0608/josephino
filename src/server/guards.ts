import "server-only";
import { notFound } from "next/navigation";
import { NotFoundError } from "./errors";

/** Converte NotFoundError em 404 (inclui tentativas de abrir registros de outra empresa). */
export async function notFoundGuard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    if ((e as { code?: string })?.code === "22P02") notFound(); // uuid malformado
    throw e;
  }
}
