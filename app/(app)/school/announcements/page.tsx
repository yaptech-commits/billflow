"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  SchoolAnnouncement,
  SchoolClass,
  SchoolNotificationChannel,
  Student,
  getSchoolAnnouncements,
  getSchoolClasses,
  getStudents,
  createSchoolAnnouncement,
  deleteSchoolAnnouncement,
  enqueueSchoolNotification,
} from "@/lib/school-db";
import { BusinessProfile, getBusinessProfile } from "@/lib/db";
import { toast } from "react-hot-toast";
import { Megaphone, Send, Trash2, Plus, Users, Calendar, Bell, X } from "lucide-react";
import Modal from "@/components/ui/Modal";

export default function SchoolAnnouncementsPage() {
  const { businessId, propertyId: activePropertyId } = useAuth();
  const propertyId = activePropertyId || "default_property";
  const [announcements, setAnnouncements] = useState<SchoolAnnouncement[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    message: "",
    targetClass: "all",
    channel: "both" as "email" | "sms" | "both",
  });

  const channelsFor = (channel: "email" | "sms" | "both"): SchoolNotificationChannel[] =>
    channel === "both" ? ["in_app", "email", "sms"] : ["in_app", channel];

  useEffect(() => {
    if (businessId) {
      loadData();
    }
  }, [businessId]);

  const loadData = async () => {
    if (!businessId) return;
    const currentBusinessId = businessId;
    try {
      setLoading(true);
      const [annList, classList, studentList] = await Promise.all([
        getSchoolAnnouncements(currentBusinessId, propertyId),
        getSchoolClasses(currentBusinessId, propertyId),
        getStudents(currentBusinessId, propertyId),
      ]);
      setAnnouncements(annList);
      setClasses(classList);
      setStudents(studentList);
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to load announcements.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId || !form.title.trim() || !form.message.trim()) {
      toast.error("Please provide an announcement title and message.");
      return;
    }

    try {
      setSendingId("new");
      const currentBusinessId = businessId;
      const targetStudents =
        form.targetClass === "all"
          ? students
          : students.filter((s) => s.classGrade === form.targetClass);
      const recipients = targetStudents.filter((student) => student.guardianEmail || student.guardianPhone);
      const announcementMessage = `Dear Parent/Guardian of {studentName} ({classGrade}):\n\n${form.message.trim()}\n\n- School Administration`;
      const channels = channelsFor(form.channel);

      const announcementId = await createSchoolAnnouncement({
        businessId: currentBusinessId,
        propertyId,
        title: form.title.trim(),
        message: form.message.trim(),
        targetClass: form.targetClass,
        channels,
        channel: form.channel,
        smsTracking: {
          totalRecipients: recipients.length,
          sentCount: 0,
          failedCount: 0,
          pendingCount:
            form.channel === "sms" || form.channel === "both"
              ? recipients.filter((student) => Boolean(student.guardianPhone)).length
              : 0,
          attempts:
            form.channel === "sms" || form.channel === "both"
              ? recipients
                  .filter((student) => Boolean(student.guardianPhone))
                  .map((student) => ({
                    studentId: student.id || student.admissionNumber,
                    studentName: student.fullName,
                    guardianPhone: student.guardianPhone,
                    status: "pending" as const,
                    timestamp: new Date().toISOString(),
                  }))
              : [],
        },
      });

      let queuedCount = 0;
      for (const student of recipients) {
        await enqueueSchoolNotification({
          businessId: currentBusinessId,
          propertyId,
          studentId: student.id || student.admissionNumber,
          studentName: student.fullName,
          recipientEmail: student.guardianEmail || undefined,
          recipientPhone: student.guardianPhone || undefined,
          title: `School Announcement: ${form.title.trim()}`,
          message: announcementMessage
            .replaceAll("{studentName}", student.fullName)
            .replaceAll("{classGrade}", student.classGrade),
          type: "announcement",
          channels,
        });
        queuedCount++;
      }

      toast.success(
        `Announcement ${announcementId ? "published" : "saved"} and queued for ${queuedCount} parent(s). Delivery status will update as providers respond.`,
      );
      setIsModalOpen(false);
      setForm({
        title: "",
        message: "",
        targetClass: "all",
        channel: "both",
      });
      await loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to post announcement.");
    } finally {
      setSendingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this announcement?")) return;
    try {
      await deleteSchoolAnnouncement(id);
      toast.success("Announcement deleted.");
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete announcement.");
    }
  };

  const handleResend = async (announcement: SchoolAnnouncement) => {
    if (!confirm(`Resend "${announcement.title}" bulk notification to parents?`)) return;
    if (!businessId) return;
    const currentBusinessId = businessId;
    try {
      setSendingId(announcement.id!);
      const targetStudents =
        announcement.targetClass === "all"
          ? students
          : students.filter((s) => s.classGrade === announcement.targetClass);
      const channels = announcement.channels?.length
        ? announcement.channels
        : channelsFor(announcement.channel || "both");

      let count = 0;
      for (const student of targetStudents) {
        if (student.guardianEmail || student.guardianPhone) {
          await enqueueSchoolNotification({
            businessId: currentBusinessId,
            propertyId,
            studentId: student.id || student.admissionNumber,
            studentName: student.fullName,
            recipientEmail: student.guardianEmail || undefined,
            recipientPhone: student.guardianPhone || undefined,
            title: `School Announcement: ${announcement.title}`,
            message: `Dear Parent/Guardian of ${student.fullName} (${student.classGrade}):\n\n${announcement.message}\n\n- School Administration`,
            type: "announcement",
            channels,
          });
          count++;
        }
      }
      toast.success(`Successfully queued the announcement for ${count} parent(s).`);
    } catch (err: any) {
      toast.error(err.message || "Failed to resend announcement.");
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Megaphone className="text-gold" /> School Announcements & Broadcasts
          </h1>
          <p className="text-muted text-sm mt-1">
            Publish school-wide or class-specific announcements and broadcast updates instantly to parents.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="btn-primary flex items-center gap-2 self-start md:self-auto"
        >
          <Plus size={18} /> New Announcement
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card bg-white/5 border border-border p-4 rounded-xl">
          <p className="text-muted text-xs uppercase tracking-wider">Total Broadcasts</p>
          <p className="text-2xl font-bold text-white mt-1">{announcements.length}</p>
        </div>
        <div className="card bg-white/5 border border-border p-4 rounded-xl">
          <p className="text-muted text-xs uppercase tracking-wider">Targeted Classes</p>
          <p className="text-2xl font-bold text-gold mt-1">{classes.length}</p>
        </div>
        <div className="card bg-white/5 border border-border p-4 rounded-xl">
          <p className="text-muted text-xs uppercase tracking-wider">Guardians Reachable</p>
          <p className="text-2xl font-bold text-green mt-1">
            {students.filter((s) => s.guardianEmail || s.guardianPhone).length}
          </p>
        </div>
      </div>

      {/* Announcements List */}
      <div className="space-y-4">
        {loading ? (
          <div className="card p-12 text-center text-muted">Loading announcements...</div>
        ) : announcements.length === 0 ? (
          <div className="card p-12 text-center text-muted">
            <Megaphone size={48} className="mx-auto text-muted/40 mb-3" />
            <p className="text-base font-medium">No announcements posted yet</p>
            <p className="text-xs mt-1">Create an announcement to broadcast updates to parents via Email and SMS.</p>
          </div>
        ) : (
          announcements.map((item) => (
            <div key={item.id} className="card bg-white/5 border border-border p-6 rounded-2xl space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
                <div>
                  <h3 className="text-lg font-bold text-white">{item.title}</h3>
                  <div className="flex items-center gap-3 text-xs text-muted mt-1">
                    <span className="flex items-center gap-1">
                      <Calendar size={13} />{" "}
                      {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "Recent"}
                    </span>
                    <span className="bg-gold/10 text-gold px-2.5 py-0.5 rounded-full font-medium">
                      Target: {item.targetClass === "all" ? "All Classes" : item.targetClass}
                    </span>
                    <span className="bg-white/10 text-surface px-2.5 py-0.5 rounded-full uppercase text-[10px]">
                      {item.channel}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button
                    onClick={() => handleResend(item)}
                    disabled={sendingId === item.id}
                    className="btn-secondary text-xs flex items-center gap-1.5"
                  >
                    <Send size={13} /> {sendingId === item.id ? "Broadcasting..." : "Resend"}
                  </button>
                  <button
                    onClick={() => handleDelete(item.id!)}
                    className="text-red-400 hover:text-red-300 p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <p className="text-sm text-surface whitespace-pre-wrap leading-relaxed">
                {item.message}
              </p>

              {item.smsTracking && (
                <div className="mt-4 pt-3 border-t border-border/60 bg-white/[0.02] p-3 rounded-xl text-xs space-y-2">
                  <div className="flex items-center justify-between text-muted font-medium">
                    <span>SMS Delivery Tracking Summary:</span>
                    <span className="text-white">Total Recipients: {item.smsTracking.totalRecipients}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="bg-green-500/10 border border-green-500/20 px-3 py-1.5 rounded-lg">
                      <span className="text-muted block text-[10px]">Delivered SMS</span>
                      <span className="text-green-400 font-bold text-sm">{item.smsTracking.sentCount}</span>
                    </div>
                    <div className="bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg">
                      <span className="text-muted block text-[10px]">Pending SMS</span>
                      <span className="text-amber-300 font-bold text-sm">{item.smsTracking.pendingCount || 0}</span>
                    </div>
                    <div className="bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-lg">
                      <span className="text-muted block text-[10px]">Failed SMS</span>
                      <span className="text-red-400 font-bold text-sm">{item.smsTracking.failedCount}</span>
                    </div>
                    <div className="bg-white/5 border border-border px-3 py-1.5 rounded-lg flex items-center justify-between">
                      <span className="text-muted">Delivery Rate:</span>
                      <span className="text-gold font-bold">
                        {item.smsTracking.totalRecipients > 0
                          ? Math.round((item.smsTracking.sentCount / item.smsTracking.totalRecipients) * 100)
                          : 0}
                        %
                      </span>
                    </div>
                  </div>
                  {item.smsTracking.attempts && item.smsTracking.attempts.length > 0 && (
                    <details className="text-[11px] text-muted pt-1">
                      <summary className="cursor-pointer hover:text-white transition-colors">
                        View Individual Recipient Log ({item.smsTracking.attempts.length})
                      </summary>
                      <div className="mt-2 space-y-1 max-h-36 overflow-y-auto pr-1">
                        {item.smsTracking.attempts.map((att, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-black/30 px-2 py-1 rounded">
                            <span className="text-white">{att.studentName} ({att.guardianPhone})</span>
                            <div className="flex items-center gap-2">
                              {att.status === "sent" ? (
                                <span className="text-green-400 font-mono text-[10px]">SENT [{att.providerRef}]</span>
                              ) : att.status === "pending" ? (
                                <span className="text-amber-300 font-mono text-[10px]">PENDING</span>
                              ) : (
                                <span className="text-red-400 font-mono text-[10px]" title={att.reason}>FAILED</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* New Announcement Modal */}
      <Modal title="Post & Broadcast Announcement" open={isModalOpen} onClose={() => setIsModalOpen(false)}>
        <div className="p-6 space-y-6 max-w-lg w-full">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Bell className="text-gold" /> Post & Broadcast Announcement
            </h2>
            <button
              onClick={() => setIsModalOpen(false)}
              className="text-muted hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted uppercase mb-1">
                Announcement Title *
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
                placeholder="e.g. End of Term Examination Timetable"
                className="w-full bg-white/5 border border-border rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-gold"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted uppercase mb-1">
                  Target Audience
                </label>
                <select
                  value={form.targetClass}
                  onChange={(e) => setForm({ ...form, targetClass: e.target.value })}
                  className="w-full bg-white/5 border border-border rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-gold"
                >
                  <option value="all" className="bg-surface text-white">All Classes (School-wide)</option>
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.name} className="bg-surface text-white">
                      {cls.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted uppercase mb-1">
                  Dispatch Channel
                </label>
                <select
                  value={form.channel}
                  onChange={(e) => setForm({ ...form, channel: e.target.value as any })}
                  className="w-full bg-white/5 border border-border rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-gold"
                >
                  <option value="both" className="bg-surface text-white">Email & SMS (Both)</option>
                  <option value="email" className="bg-surface text-white">Email Only</option>
                  <option value="sms" className="bg-surface text-white">SMS Only</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted uppercase mb-1">
                Announcement Message *
              </label>
              <textarea
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                required
                rows={5}
                placeholder="Type your message to parents here..."
                className="w-full bg-white/5 border border-border rounded-xl p-3 text-white text-sm outline-none focus:border-gold resize-none"
              />
              <p className="text-xs text-muted mt-1">
                This message will be posted to the announcement feed and automatically dispatched to all matching parents.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="btn-ghost"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={sendingId === "new"}
                className="btn-primary flex items-center gap-2"
              >
                <Send size={16} /> {sendingId === "new" ? "Broadcasting..." : "Publish & Broadcast"}
              </button>
            </div>
          </form>
        </div>
      </Modal>
    </div>
  );
}
