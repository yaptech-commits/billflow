"use client";
import { useEffect, useState } from "react";
import { Bell, Check, Clock, Info, Package, AlertTriangle, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getNotifications, markNotificationAsRead, Notification } from "@/lib/db";
import Modal from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

export default function Topbar({ title }: { title: string }) {
  const { user, businessId, role } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = async () => {
    if (!businessId || role !== "owner") return;
    setLoading(true);
    try {
      const data = await getNotifications(businessId);
      setNotifications(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    // Refresh notifications every 5 minutes
    const interval = setInterval(fetchNotifications, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [businessId, role]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleRefresh = () => {
    window.location.reload();
  };

  const handleMarkRead = async (id: string) => {
    await markNotificationAsRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  return (
    <header className="sticky top-0 z-40 bg-deep border-b border-border px-7 py-4 flex items-center justify-between">
      <h1 className="font-grotesk font-bold text-xl text-white">{title}</h1>
      <div className="flex items-center gap-3">
        <button 
          onClick={handleRefresh}
          className="text-muted hover:text-gold transition-colors p-2 rounded-full hover:bg-white/5"
          title="Refresh Page"
        >
          <RefreshCw size={18} />
        </button>

        {role === "owner" && (
          <button 
            onClick={() => setShowNotifications(true)}
            className="relative text-muted hover:text-surface transition-colors p-2 rounded-full hover:bg-white/5"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red rounded-full" />
            )}
          </button>
        )}
        <div className="text-sm text-muted">
          {user?.email}
        </div>
      </div>

      <Modal 
        open={showNotifications} 
        onClose={() => setShowNotifications(false)} 
        title="Notifications"
      >
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
          {loading && notifications.length === 0 ? (
            <p className="text-center py-10 text-muted animate-pulse">Loading notifications...</p>
          ) : notifications.length === 0 ? (
            <div className="text-center py-10">
              <Info className="mx-auto text-muted mb-2" size={24} />
              <p className="text-muted text-sm">No notifications for now.</p>
              <p className="text-[10px] text-muted mt-1">Low stock alerts will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {notifications.map(n => (
                <div 
                  key={n.id} 
                  className={cn(
                    "p-3 rounded-lg border transition-all relative group",
                    n.read ? "bg-white/[0.02] border-border/50" : "bg-gold/5 border-gold/30"
                  )}
                >
                  <div className="flex gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                      n.type === "low_stock" ? "bg-red/10 text-red" : "bg-gold/10 text-gold"
                    )}>
                      {n.type === "low_stock" ? <Package size={14} /> : <Info size={14} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className={cn("text-xs font-bold truncate", n.read ? "text-muted" : "text-surface")}>
                          {n.title}
                        </h4>
                        {!n.read && (
                          <button 
                            onClick={() => handleMarkRead(n.id!)}
                            className="text-[10px] text-gold hover:underline flex-shrink-0"
                          >
                            Mark read
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] text-muted mt-1 leading-relaxed">
                        {n.message}
                      </p>
                      <div className="flex items-center gap-1.5 mt-2 text-[9px] text-muted/60 uppercase font-bold">
                        <Clock size={10} />
                        {formatDistanceToNow(n.createdAt.toDate(), { addSuffix: true })}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="mt-6 pt-4 border-t border-border flex justify-between items-center">
          <p className="text-[10px] text-muted">Notifications are cleared after 1 week.</p>
          <button className="btn-ghost text-xs" onClick={() => setShowNotifications(false)}>Close</button>
        </div>
      </Modal>
    </header>
  );
}
