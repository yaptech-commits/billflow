"use client";
import { Bell } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export default function Topbar({ title }: { title: string }) {
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-40 bg-deep border-b border-border px-7 py-4 flex items-center justify-between">
      <h1 className="font-grotesk font-bold text-xl text-white">{title}</h1>
      <div className="flex items-center gap-3">
        <button className="relative text-muted hover:text-surface transition-colors">
          <Bell size={18} />
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-red rounded-full" />
        </button>
        <div className="text-sm text-muted">
          {user?.email}
        </div>
      </div>
    </header>
  );
}
