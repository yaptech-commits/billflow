"use client";

import { useEffect, useState } from "react";
import { useHotelContext } from "@/components/hotel/HotelAccessGuard";
import HotelAccessGuard from "@/components/hotel/HotelAccessGuard";
import { 
  calculateHotelMetrics, 
  HotelRevenueMetrics, 
  runNightAudit, 
  getHousekeepingTasks, 
  HousekeepingTask, 
  updateHousekeepingTask,
  getMaintenanceWorkOrders,
  MaintenanceWorkOrder,
  createMaintenanceWorkOrder
} from "@/lib/db";
import { useAuth } from "@/lib/auth-context";
import toast from "react-hot-toast";

export default function HotelReportsAndHousekeepingPage() {
  return (
    <HotelAccessGuard>
      <HotelReportsContent />
    </HotelAccessGuard>
  );
}

function HotelReportsContent() {
  const { businessId, propertyId, propertyName } = useHotelContext();
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<HotelRevenueMetrics | null>(null);
  const [tasks, setTasks] = useState<HousekeepingTask[]>([]);
  const [workOrders, setWorkOrders] = useState<MaintenanceWorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [auditing, setAuditing] = useState(false);

  // New maintenance modal / form state
  const [showMaintModal, setShowMaintModal] = useState(false);
  const [maintRoom, setMaintRoom] = useState("");
  const [maintTitle, setMaintTitle] = useState("");
  const [maintDesc, setMaintDesc] = useState("");
  const [maintPriority, setMaintPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");

  const loadData = async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const m = await calculateHotelMetrics(businessId, propertyId);
      const t = await getHousekeepingTasks(businessId, propertyId);
      const w = await getMaintenanceWorkOrders(businessId, propertyId);
      setMetrics(m);
      setTasks(t);
      setWorkOrders(w);
    } catch (err: any) {
      toast.error("Failed to load hotel reports: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [businessId, propertyId]);

  const handleRunNightAudit = async () => {
    if (!businessId || !user) return;
    if (!confirm("Run night audit for all checked-in rooms? This will post nightly room charges and occupancy taxes.")) return;
    setAuditing(true);
    try {
      const result = await runNightAudit(businessId, propertyId, user.uid);
      toast.success(`Night Audit complete! Posted charges for ${result.rooms} rooms (Total: ₵${result.totalAmount.toFixed(2)})`);
      loadData();
    } catch (err: any) {
      toast.error("Night Audit failed: " + err.message);
    } finally {
      setAuditing(false);
    }
  };

  const handleToggleClean = async (task: HousekeepingTask) => {
    try {
      const nextStatus = task.status === "completed" ? "pending" : "completed";
      await updateHousekeepingTask(task.id, { status: nextStatus });
      toast.success(`Housekeeping status updated for Room ${task.roomNumber}`);
      loadData();
    } catch (err: any) {
      toast.error("Failed to update housekeeping: " + err.message);
    }
  };

  const handleCreateMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId || !user || !maintRoom || !maintTitle) return;
    try {
      await createMaintenanceWorkOrder({
        businessId,
        propertyId,
        roomNumber: maintRoom,
        issueTitle: maintTitle,
        description: maintDesc,
        priority: maintPriority,
        status: "reported",
        reportedBy: user.email || user.uid,
      });
      toast.success("Maintenance work order logged");
      setShowMaintModal(false);
      setMaintRoom("");
      setMaintTitle("");
      setMaintDesc("");
      loadData();
    } catch (err: any) {
      toast.error("Failed to log maintenance: " + err.message);
    }
  };

  if (loading) {
    return <div className="p-6 text-muted text-sm">Loading revenue metrics & housekeeping…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Revenue, Housekeeping & Night Audit</h1>
          <p className="text-sm text-muted">Property: {propertyName} · Financial & operational metrics</p>
        </div>
        <button
          onClick={handleRunNightAudit}
          disabled={auditing}
          className="bg-gold text-black font-semibold px-4 py-2 rounded-lg hover:bg-gold/90 transition shadow-sm disabled:opacity-50"
        >
          {auditing ? "Running Night Audit…" : "🌙 Run Night Audit (Post Room Charges)"}
        </button>
      </div>

      {/* Revenue & Occupancy Metrics Grid */}
      {metrics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card bg-surface border border-border p-4 rounded-xl">
            <p className="text-xs text-muted uppercase font-medium">Occupancy Rate</p>
            <p className="text-3xl font-extrabold text-foreground mt-1">{metrics.occupancyRate}%</p>
            <p className="text-xs text-muted mt-2">{metrics.occupiedRooms} of {metrics.totalRooms} rooms occupied</p>
          </div>
          <div className="card bg-surface border border-border p-4 rounded-xl">
            <p className="text-xs text-muted uppercase font-medium">Total Room Revenue</p>
            <p className="text-3xl font-extrabold text-gold mt-1">₵{metrics.totalRoomRevenue.toLocaleString()}</p>
            <p className="text-xs text-muted mt-2">Accumulated stay charges</p>
          </div>
          <div className="card bg-surface border border-border p-4 rounded-xl">
            <p className="text-xs text-muted uppercase font-medium">Average Daily Rate (ADR)</p>
            <p className="text-3xl font-extrabold text-foreground mt-1">₵{metrics.adr.toFixed(2)}</p>
            <p className="text-xs text-muted mt-2">Per sold room</p>
          </div>
          <div className="card bg-surface border border-border p-4 rounded-xl">
            <p className="text-xs text-muted uppercase font-medium">RevPAR</p>
            <p className="text-3xl font-extrabold text-foreground mt-1">₵{metrics.revPar.toFixed(2)}</p>
            <p className="text-xs text-muted mt-2">Revenue per available room</p>
          </div>
        </div>
      )}

      {/* Housekeeping & Maintenance Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Housekeeping Tasks */}
        <div className="card bg-surface border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Housekeeping Tasks</h2>
            <span className="text-xs bg-muted/20 px-2.5 py-1 rounded-full text-muted">{tasks.length} active tasks</span>
          </div>
          <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
            {tasks.length === 0 ? (
              <p className="text-sm text-muted py-4 text-center">No pending housekeeping tasks.</p>
            ) : (
              tasks.map(t => (
                <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border border-border/60 bg-background/50">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-foreground">Room {t.roomNumber}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${t.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                        {t.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted mt-0.5 capitalize">{t.taskType.replace('_', ' ')} {t.notes ? `· ${t.notes}` : ''}</p>
                  </div>
                  <button
                    onClick={() => handleToggleClean(t)}
                    className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted/10 font-medium transition"
                  >
                    {t.status === 'completed' ? 'Reopen' : 'Mark Clean'}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Maintenance Work Orders */}
        <div className="card bg-surface border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Maintenance & Repair</h2>
            <button
              onClick={() => setShowMaintModal(true)}
              className="text-xs bg-gold text-black font-semibold px-3 py-1.5 rounded-lg hover:bg-gold/90 transition"
            >
              + Log Issue
            </button>
          </div>
          <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
            {workOrders.length === 0 ? (
              <p className="text-sm text-muted py-4 text-center">No maintenance work orders logged.</p>
            ) : (
              workOrders.map(w => (
                <div key={w.id} className="p-3 rounded-lg border border-border/60 bg-background/50 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-foreground">Room {w.roomNumber}: {w.issueTitle}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${w.priority === 'urgent' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/10 text-blue-400'}`}>
                      {w.priority}
                    </span>
                  </div>
                  <p className="text-xs text-muted">{w.description}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Log Maintenance Modal */}
      {showMaintModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="card bg-surface border border-border max-w-md w-full p-6 rounded-2xl space-y-4">
            <h3 className="text-lg font-bold text-foreground">Log Maintenance Work Order</h3>
            <form onSubmit={handleCreateMaintenance} className="space-y-4">
              <div>
                <label className="text-xs text-muted font-medium">Room Number</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 104"
                  value={maintRoom}
                  onChange={e => setMaintRoom(e.target.value)}
                  className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-gold"
                />
              </div>
              <div>
                <label className="text-xs text-muted font-medium">Issue Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. AC leaking water"
                  value={maintTitle}
                  onChange={e => setMaintTitle(e.target.value)}
                  className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-gold"
                />
              </div>
              <div>
                <label className="text-xs text-muted font-medium">Description</label>
                <textarea
                  placeholder="Provide details about the issue…"
                  value={maintDesc}
                  onChange={e => setMaintDesc(e.target.value)}
                  className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-gold"
                  rows={3}
                />
              </div>
              <div>
                <label className="text-xs text-muted font-medium">Priority</label>
                <select
                  value={maintPriority}
                  onChange={e => setMaintPriority(e.target.value as any)}
                  className="w-full mt-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-gold"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowMaintModal(false)}
                  className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted/10 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-gold text-black font-semibold px-4 py-2 rounded-lg text-sm hover:bg-gold/90 transition"
                >
                  Save Work Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
