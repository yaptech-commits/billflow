import { cn } from "@/lib/utils";

type Status = "paid" | "pending" | "overdue" | "draft" | "success" | "failed";

const map: Record<Status, string> = {
  paid:    "badge-paid",
  success: "badge-paid",
  pending: "badge-pending",
  overdue: "badge-overdue",
  failed:  "badge-overdue",
  draft:   "badge-draft",
};

export default function Badge({ status }: { status: Status }) {
  return (
    <span className={cn(map[status], "before:content-[''] before:w-1.5 before:h-1.5 before:rounded-full before:bg-current")}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
