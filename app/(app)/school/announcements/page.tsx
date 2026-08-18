"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  SchoolAnnouncement,
  SchoolClass,
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
  const { businessId, role } = useAuth();
  const propertyId = "default_property";
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

  useEffect(() => {
    if (businessId) {
      loadData();
    }
  }, [businessId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [annList, classList, studentList] = await Promise.all([
        getSchoolAnnouncements(businessId, propertyId),
        getSchoolClasses(businessId, propertyId),
        getStudents(businessId, propertyId),
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
      await createSchoolAnnouncement({
        businessId,
        propertyId,
        title: form.title,
        message: form.message,
        targetClass: form.targetClass,
        channel: form.channel,
      });

      const targetStudents =
        form.targetClass === "all"
          ? students
          : students.filter((s) => s.classGrade === form.targetClass);

      let dispatchedCount = 0;
      for (const student of targetStudents) {
        if (student.guardianEmail || student.guardianPhone) {
          await enqueueSchoolNotification({
            businessId,
            propertyId,
            recipientType: "parent",
            recipientEmail: student.guardianEmail || undefined,
            recipientPhone: student.guardianPhone || undefined,
            subject: `School Announcement: ${form.title}`,
            message: `Dear Parent/Guardian of ${student.fullName} (${student.classGrade}):\n\n${form.message}\n\n- School Administration`,
            channel: form.channel,
          });
          dispatchedCount++;
        }
      }

      toast.success(`Announcement posted and dispatched to ${dispatchedCount} parent(s)!`);
      setIsModalOpen(false);
      setForm({
        title: "",
        message: "",
        targetClass: "all",
        channel: "both",
      });
      loadData();
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
    try {
      setSendingId(announcement.id!);
      const targetStudents =
        announcement.targetClass === "all"
          ? students
          : students.filter((s) => s.classGrade === announcement.targetClass);

      let count = 0;
      for (const student of targetStudents) {
        if (student.guardianEmail || student.guardianPhone) {
          await enqueueSchoolNotification({
            businessId,
            propertyId,
            recipientType: "parent",
            recipientEmail: student.guardianEmail || undefined,
            recipientPhone: student.guardianPhone || undefined,
            subject: `School Announcement: ${announcement.title}`,
            message: `Dear Parent/Guardian of ${student.fullName} (${student.classGrade}):\n\n${announcement.message}\n\n- School Administration`,
            channel: announcement.channel || "both",
          });
          count++;
        }
      }
      toast.success(`Successfully redispatched to ${count} parent(s).`);
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
            </div>
          ))
        )}
      </div>

      {/* New Announcement Modal */}
      <Modal open={isModalOpen} onClose={() => setIsModalOpen(false)}>
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
