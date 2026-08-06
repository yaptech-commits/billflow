import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string;
  delta?: string;
  trend?: "up" | "down";
  accent?: "gold" | "green" | "blue" | "red";
  className?: string;
}

export default function StatCard({ label, value, delta, trend, accent = "gold", className }: StatCardProps) {
  const accentStyles = {
    gold: "from-gold/20 to-transparent text-gold",
    green: "from-green/20 to-transparent text-green",
    blue: "from-blue/20 to-transparent text-blue",
    red: "from-red/20 to-transparent text-red",
  };

  return (
    <div className={cn("card relative overflow-hidden group", className)}>
      <div className={cn("absolute top-0 left-0 w-full h-1 bg-gradient-to-r", 
        accent === "gold" ? "from-gold to-transparent" :
        accent === "green" ? "from-green to-transparent" :
        accent === "blue" ? "from-blue to-transparent" :
        "from-red to-transparent"
      )} />
      
      <p className="text-xs font-medium text-muted mb-1 uppercase tracking-wider">{label}</p>
      <h3 className="text-2xl font-bold text-white font-grotesk">{value}</h3>
      
      {delta && (
        <div className="flex items-center gap-1 mt-2">
          {trend && (
            trend === "up" ? <TrendingUp size={12} className="text-green" /> : <TrendingDown size={12} className="text-red" />
          )}
          <span className={cn("text-[11px] font-medium", 
            trend === "up" ? "text-green" : trend === "down" ? "text-red" : "text-muted"
          )}>
            {delta}
          </span>
        </div>
      )}
    </div>
  );
}
