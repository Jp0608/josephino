export type ActionResult<T = unknown> =
  | { ok: true; message?: string; redirect?: string; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };
