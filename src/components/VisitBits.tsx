import { Badge } from "./ui";
import { VISIT_STATUS_LABEL, VISIT_STATUS_TONE } from "@/lib/domain/catalog";
import { RANGE_LABEL, type RangeStatus } from "@/lib/domain/ranges";
import type { VisitStatus } from "@/db/schema";

export function VisitStatusBadge({ status }: { status: VisitStatus }) {
  return (
    <Badge tone={VISIT_STATUS_TONE[status]} dot>
      {VISIT_STATUS_LABEL[status]}
    </Badge>
  );
}

const RANGE_TONE: Record<RangeStatus, "ok" | "warn" | "danger" | "neutral"> = {
  in_range: "ok",
  below: "warn",
  above: "danger",
  not_measured: "neutral",
  no_range: "neutral",
};
export function RangeBadge({ status }: { status: string }) {
  const s = status as RangeStatus;
  return <Badge tone={RANGE_TONE[s] ?? "neutral"}>{RANGE_LABEL[s] ?? status}</Badge>;
}
