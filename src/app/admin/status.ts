import type { Tone } from "@/components/ui";

export const STATUS_TONE: Record<string, Tone> = { active: "ok", trialing: "info", past_due: "warn", trial_expired: "danger", suspended: "danger", cancelled: "neutral" };
