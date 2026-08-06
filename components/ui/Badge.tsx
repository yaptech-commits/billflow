import { cn } from "@/lib/utils";

interface BadgeProps {
  status: string;
  className?: string;
}

export default function Badge({ status, className }: BadgeProps) {
  const getStyles = () => {
    switch (status.toLowerCase()) {
      case "paid":
      case "success":
      case "active":
        return "bg-green/10 text-green border-green/20";
      case "pending":
      case "ordered":
        return "bg-gold/10 text-gold border-gold/20";
      case "overdue":
      case "failed":
      case "suspended":
        return "bg-red/10 text-red border-red/20";
      case "received":
        return "bg-blue/10 text-blue border-blue/20";
      default:
        return "bg-white/5 text-muted border-white/10";
    }
  };

  return (
    <span className={cn(
      "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border",
      getStyles(),
      className
    )}>
      {status}
    </span>
  );
}
