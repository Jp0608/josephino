import "server-only";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { newToken } from "./crypto";
import { UserError } from "./errors";

/**
 * Armazenamento privado de arquivos (fotos, logos). Nunca servido diretamente:
 * todo acesso passa por uma rota que confere a empresa ou o token público do documento.
 * Implementação em disco; para produção serverless, troque por S3/R2/Supabase Storage mantendo a mesma interface.
 */
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
  const file = safeKey(key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, buf);
  return { key, mime, size: buf.length };
}

export async function readFileByKey(key: string) {
  return readFile(safeKey(key));
}

export async function deleteFileByKey(key: string) {
  await unlink(safeKey(key)).catch(() => {});
}
