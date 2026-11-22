import "server-only";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import { withTenant } from "@/db";
import { newToken } from "./crypto";
import { UserError } from "./errors";

/**
 * Armazenamento privado de arquivos (fotos, logos). Nunca servido diretamente:
 * todo acesso passa por uma rota que confere a empresa ou o token público do documento.
 * Dois modos: disco (servidor com volume persistente) ou banco de dados (hospedagem serverless,
 * como a Vercel, que não guarda arquivos). STORAGE_DRIVER=db força o banco; na Vercel é o padrão.
 */
const useDb = () => process.env.STORAGE_DRIVER === "db" || (!!process.env.VERCEL && process.env.STORAGE_DRIVER !== "disk");
const tenantOf = (key: string) => key.split("/")[0];
const ROOT = () => path.resolve(process.env.STORAGE_DIR || path.join(process.cwd(), ".data", "uploads"));

const ALLOWED: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const MAX_UPLOAD = 6 * 1024 * 1024;

function safeKey(key: string) {
  if (!/^[a-z0-9-]+\/[A-Za-z0-9_-]+\.(jpg|png|webp)$/.test(key)) throw new Error("chave inválida");
  return path.join(ROOT(), key);
}

/** Confere o tipo real pelos primeiros bytes (não confia na extensão nem no Content-Type). */
function sniff(buf: Buffer): string | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  return null;
}

export async function saveImage(tenantId: string, buf: Buffer) {
  if (buf.length > MAX_UPLOAD) throw new UserError("Imagem muito grande (máx. 6 MB).");
  const mime = sniff(buf);
  if (!mime || !ALLOWED[mime]) throw new UserError("Formato não suportado. Envie JPG, PNG ou WEBP.");
  const key = `${tenantId}/${newToken(18)}.${ALLOWED[mime]}`;
  if (useDb()) {
    safeKey(key);
    await withTenant(tenantId, (tx) => tx.execute(sql`insert into file_blobs (key, tenant_id, mime, data) values (${key}, ${tenantId}, ${mime}, ${buf})`));
    return { key, mime, size: buf.length };
  }
  const file = safeKey(key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, buf);
  return { key, mime, size: buf.length };
}

export async function readFileByKey(key: string): Promise<Buffer> {
  if (useDb()) {
    safeKey(key);
    const rows = (await withTenant(tenantOf(key), (tx) => tx.execute(sql`select data from file_blobs where key = ${key}`))) as unknown as { data: Buffer }[];
    if (!rows[0]) throw new UserError("Arquivo não encontrado.");
    return Buffer.from(rows[0].data);
  }
  return readFile(safeKey(key));
}

export async function deleteFileByKey(key: string) {
  if (useDb()) {
    await withTenant(tenantOf(key), (tx) => tx.execute(sql`delete from file_blobs where key = ${key}`)).catch(() => {});
    return;
  }
  await unlink(safeKey(key)).catch(() => {});
}
