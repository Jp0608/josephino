/**
 * Fila offline mínima em IndexedDB (fotos e finalizações pendentes).
 * Texto do rascunho fica no localStorage; blobs de foto no IndexedDB.
 */
const DB = "ondaro-offline";
const STORE = "queue";

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export type QueuedPhoto = { id: string; visitId: string; kind: string; caption: string; blob: Blob; createdAt: number };

export async function queuePut(item: QueuedPhoto) {
  const db = await open();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
export async function queueList(visitId: string): Promise<QueuedPhoto[]> {
  const db = await open();
  return new Promise((res, rej) => {
    const r = db.transaction(STORE).objectStore(STORE).getAll();
    r.onsuccess = () => res((r.result as QueuedPhoto[]).filter((x) => x.visitId === visitId));
    r.onerror = () => rej(r.error);
  });
}
export async function queueDelete(id: string) {
  const db = await open();
  await new Promise<void>((res) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => res();
  });
}

/** Reduz a foto para no máximo 1600px e JPEG ~80% antes de enviar (economiza dados móveis). */
export async function compressImage(file: File, max = 1600, quality = 0.8): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}
