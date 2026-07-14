import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string;
  delta?: string;
  trend?: "up" | "down";
  accent?: "gold" | "green" | "blue" | "red";
}

const accents: Record<string, string> = {
  gold:  "before:bg-gold",
  green: "before:bg-green",
  blue:  "before:bg-[#4A9EFF]",
  red:   "before:bg-red",
};

export default function StatCard({ label, value, delta, trend = "up", accent = "gold" }: StatCardProps) {
  return (
    <div className={cn(
      "bg-card border border-border rounded-xl p-5 relative overflow-hidden",
      "before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-0.5",
      accents[accent]
    )}>
      <p className="text-[11px] font-medium text-muted uppercase tracking-widest mb-2">{label}</p>
      <p className="font-grotesk text-2xl font-bold text-white mb-1.5">{value}</p>
      {delta && (
        <p className={cn("flex items-center gap-1 text-xs", trend === "up" ? "text-green" : "text-red")}>
          {trend === "up" ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {delta}
        </p>
      )}
    </div>
  );
}
