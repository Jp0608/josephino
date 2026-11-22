import { afterAll } from "vitest";
afterAll(async () => {
  await (globalThis as unknown as { __ondaroSql?: { end: () => Promise<void> } }).__ondaroSql?.end();
  (globalThis as unknown as { __ondaroSql?: unknown; __ondaroDb?: unknown }).__ondaroSql = undefined;
  (globalThis as unknown as { __ondaroDb?: unknown }).__ondaroDb = undefined;
});
