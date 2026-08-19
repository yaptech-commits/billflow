"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  Student,
  ParentLink,
  getStudents,
  createStudent,
  updateStudent,
  deleteStudent,
  createParentLink,
  getParentLinks,
  getNotificationPreferences,
  enqueueSchoolNotification,
  SchoolNotificationPreferences,
  SchoolNotificationChannel,
} from "@/lib/school-db";
import { BusinessProfile, getBusinessProfile } from "@/lib/db";
import { buildAdmissionLetterContent } from "@/lib/school-admission-letter";
import { toast } from "react-hot-toast";
import { Users, UserPlus, Search, Edit, Trash2, GraduationCap, ShieldCheck, X, Check } from "lucide-react";
import Modal from "@/components/ui/Modal";

export default function StudentsPage() {
  const { businessId, role, propertyId: authPropertyId } = useAuth();
  const propertyId = authPropertyId || "default_property";
  const [students, setStudents] = useState<Student[]>([]);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [notificationPreferences, setNotificationPreferences] = useState<SchoolNotificationPreferences | null>(null);
  const [parentLinks, setParentLinks] = useState<ParentLink[]>([]);
  const [selectedParentStudent, setSelectedParentStudent] = useState<Student | null>(null);
  const [isParentModalOpen, setIsParentModalOpen] = useState(false);
  const [parentForm, setParentForm] = useState({ parentName: "", parentEmail: "", parentPhone: "" });
  const [searchTerm, setSearchTerm] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  const [form, setForm] = useState({
    admissionNumber: "",
    fullName: "",
    classGrade: "Grade 1",
    guardianName: "",
    guardianPhone: "",
    guardianEmail: "",
    status: "active" as "active" | "graduated" | "withdrawn",
  });

  const loadData = async () => {
    if (!businessId) return;
    const [stList, prof, links, preferences] = await Promise.all([
      getStudents(businessId, propertyId),
      getBusinessProfile(businessId),
      getParentLinks(businessId, propertyId),
      getNotificationPreferences(businessId, propertyId),
    ]);
    setStudents(stList);
    setBusinessProfile(prof);
    setNotificationPreferences(preferences);
    setParentLinks(links);
  };

  useEffect(() => {
    loadData();
  }, [businessId, propertyId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId) return;
    try {
      if (editingStudent && editingStudent.id) {
        await updateStudent(editingStudent.id, form);
        toast.success("Student updated successfully.");
      } else {
        const createdStudent = await createStudent({
          businessId,
          propertyId: propertyId || "default_property",
          ...form,
        });
        const guardianEmail = form.guardianEmail.trim();
        const guardianPhone = form.guardianPhone.trim();
        const channels: SchoolNotificationChannel[] = ["in_app"];
        if (guardianEmail) channels.push("email");
        if (guardianPhone && notificationPreferences?.admissionLetterSms === true) channels.push("sms");
        let admissionDeliveryStatus: "queued" | "missing" | "failed" = "missing";

        // Automatically save parent details and create parent portal link if guardian email is present.
        if (guardianEmail) {
          try {
            await createParentLink({
              businessId,
              propertyId,
              studentId: createdStudent.id,
              studentName: form.fullName,
              parentEmail: guardianEmail,
              parentName: form.guardianName,
              parentPhone: form.guardianPhone,
            });
          } catch (linkErr) {
            console.error("Auto-parent link warning:", linkErr);
          }

          // Queue the branded admission letter after the student record is safely persisted.
          // Provider failures are intentionally isolated so a successful registration is never
          // reported as failed just because an external email service is unavailable.
          try {
            const profileForLetter = businessProfile || await getBusinessProfile(businessId);
            const letter = buildAdmissionLetterContent(
              {
                fullName: form.fullName,
                admissionNumber: createdStudent.admissionNumber,
                classGrade: form.classGrade,
                guardianName: form.guardianName,
                status: form.status,
              },
              profileForLetter,
            );
            await enqueueSchoolNotification({
              businessId,
              propertyId,
              studentId: createdStudent.id,
              studentName: form.fullName,
              recipientEmail: guardianEmail,
              recipientPhone: guardianPhone || undefined,
              title: letter.subject,
              message: letter.message,
              html: letter.html,
              metadata: {
                admissionNumber: createdStudent.admissionNumber,
                classGrade: form.classGrade,
                deliveryPurpose: "admission_letter",
                documentTitle: letter.title,
              },
              type: "admission_created",
              channels,
            });
            admissionDeliveryStatus = "queued";
          } catch (emailErr) {
            admissionDeliveryStatus = "failed";
            console.error("Admission letter email queue warning:", emailErr);
          }
        }

        // If email is missing, an opted-in guardian phone can still receive the letter by SMS.
        if (!guardianEmail && guardianPhone && notificationPreferences?.admissionLetterSms === true) {
          try {
            const profileForLetter = businessProfile || await getBusinessProfile(businessId);
            const letter = buildAdmissionLetterContent(
              {
                fullName: form.fullName,
                admissionNumber: createdStudent.admissionNumber,
                classGrade: form.classGrade,
                guardianName: form.guardianName,
                status: form.status,
              },
              profileForLetter,
            );
            await enqueueSchoolNotification({
              businessId,
              propertyId,
              studentId: createdStudent.id,
              studentName: form.fullName,
              recipientPhone: guardianPhone,
              title: letter.subject,
              message: letter.message,
              metadata: {
                admissionNumber: createdStudent.admissionNumber,
                classGrade: form.classGrade,
                deliveryPurpose: "admission_letter",
                documentTitle: letter.title,
              },
              type: "admission_created",
              channels: ["in_app", "sms"],
            });
            admissionDeliveryStatus = "queued";
          } catch (smsErr) {
            admissionDeliveryStatus = "failed";
            console.error("Admission letter SMS queue warning:", smsErr);
          }
        }

        toast.success(`Student registered. Automatic Student ID: ${createdStudent.admissionNumber}`);
        if (admissionDeliveryStatus === "queued") {
          const deliveryLabels = channels.filter((channel) => channel !== "in_app").map((channel) => channel.toUpperCase()).join(" + ");
          toast.success(`Admission letter queued via ${deliveryLabels || "in-app"}. Delivery status is tracked in school notifications.`);
        } else if (admissionDeliveryStatus === "failed") {
          toast.error("Student registered, but the admission letter notification could not be queued. Check notification delivery settings.");
        } else if (guardianPhone && notificationPreferences?.admissionLetterSms !== true) {
          toast(`Student registered. Add a guardian email or enable admission SMS in Settings to send the letter.`);
        } else {
          toast("Student registered without an admission-letter email. Add a guardian email to send it later.");
        }
      }
      setIsAddOpen(false);
      setEditingStudent(null);
      setForm({
        admissionNumber: "",
        fullName: "",
        classGrade: "Grade 1",
        guardianName: "",
        guardianPhone: "",
        guardianEmail: "",
        status: "active",
      });
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to save student.");
    }
  };

  const handleEdit = (s: Student) => {
    setEditingStudent(s);
    setForm({
      admissionNumber: s.admissionNumber,
      fullName: s.fullName,
      classGrade: s.classGrade,
      guardianName: s.guardianName,
      guardianPhone: s.guardianPhone,
      guardianEmail: s.guardianEmail || "",
      status: s.status,
    });
    setIsAddOpen(true);
  };

  const openParentModal = (student: Student) => {
    setSelectedParentStudent(student);
    setParentForm({
      parentName: student.guardianName || "",
      parentEmail: student.guardianEmail || "",
      parentPhone: student.guardianPhone || "",
    });
    setIsParentModalOpen(true);
  };

  const handleCreateParentLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessId || !selectedParentStudent?.id || !parentForm.parentEmail.trim()) {
      toast.error("A guardian email is required to create portal access.");
      return;
    }
    try {
      await createParentLink({
        businessId,
        propertyId,
        studentId: selectedParentStudent.id,
        studentName: selectedParentStudent.fullName,
        parentEmail: parentForm.parentEmail,
        parentName: parentForm.parentName,
        parentPhone: parentForm.parentPhone,
      });
      toast.success("Parent portal access created. The guardian can sign in with this email.");
      setIsParentModalOpen(false);
      setSelectedParentStudent(null);
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Could not create parent access.");
    }
  };

  const handleDelete = async (id?: string) => {
    if (!id || role !== "owner") {
      toast.error("Only owners can delete student records.");
      return;
    }
    if (confirm("Are you sure you want to remove this student record?")) {
      await deleteStudent(id);
      toast.success("Student removed.");
      loadData();
    }
  };

  const filtered = students.filter(
    (s) =>
      s.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.admissionNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.classGrade.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold font-grotesk text-white flex items-center gap-2">
            <GraduationCap className="text-gold" /> Student Directory
          </h1>
          <p className="text-xs text-muted mt-1">
            Manage enrolled students, classes, and guardian contact details for {businessProfile?.businessName || "School"}.
          </p>
        </div>
        <button
          onClick={() => {
            setEditingStudent(null);
              setForm({
              admissionNumber: "",
              fullName: "",
              classGrade: "Grade 1",
              guardianName: "",
              guardianPhone: "",
              guardianEmail: "",
              status: "active",
            });
            setIsAddOpen(true);
          }}
          className="btn-primary flex items-center gap-2"
        >
          <UserPlus size={16} /> Register New Student
        </button>
      </div>

      <div className="flex gap-4 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
          <input
            type="text"
            placeholder="Search by student name, Student ID, or class..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-field w-full pl-10"
          />
        </div>
      </div>

      <div className="card space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border text-xs text-muted uppercase">
                <th className="py-3 px-4">Student ID</th>
                <th className="py-3 px-4">Student Name</th>
                <th className="py-3 px-4">Class / Grade</th>
                <th className="py-3 px-4">Guardian Name</th>
                <th className="py-3 px-4">Guardian Phone</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Parent Portal</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-sm">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted">
                    No students found matching your search.
                  </td>
                </tr>
              ) : (
                filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-surface-hover/50">
                    <td className="py-3 px-4 font-mono text-xs text-gold">{s.admissionNumber}</td>
                    <td className="py-3 px-4 font-semibold text-white">{s.fullName}</td>
                    <td className="py-3 px-4">{s.classGrade}</td>
                    <td className="py-3 px-4">{s.guardianName}</td>
                    <td className="py-3 px-4 font-mono text-xs">{s.guardianPhone}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                          s.status === "active"
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : "bg-gray-500/10 text-gray-400 border border-gray-500/20"
                        }`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {parentLinks.some((link) => link.studentId === s.id) ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-300"><ShieldCheck size={13} /> Linked</span>
                      ) : (
                        <button onClick={() => openParentModal(s)} className="text-xs text-gold hover:underline">Create access</button>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      <button
                        onClick={() => handleEdit(s)}
                        className="p-1.5 hover:bg-surface-hover rounded text-muted hover:text-white"
                        title="Edit Student"
                      >
                        <Edit size={16} />
                      </button>
                      {role === "owner" && (
                        <button
                          onClick={() => handleDelete(s.id)}
                          className="p-1.5 hover:bg-red-500/10 rounded text-muted hover:text-red-400"
                          title="Delete Student"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title={editingStudent ? "Edit Student Details" : "Register New Student"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted mb-1 block">Student ID</label>
              <input
                type="text"
                value={form.admissionNumber}
                readOnly
                placeholder={editingStudent ? "Student ID" : "Generated automatically"}
                className="input-field w-full font-mono opacity-80"
              />
              {!editingStudent && <p className="text-[11px] text-muted mt-1">BillFlow generates this ID automatically when the student is registered.</p>}
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Class / Grade *</label>
              <select
                value={form.classGrade}
                onChange={(e) => setForm({ ...form, classGrade: e.target.value })}
                className="input-field w-full bg-surface"
              >
                <option value="Nursery">Nursery</option>
                <option value="Kindergarten">Kindergarten</option>
                <option value="Grade 1">Grade 1</option>
                <option value="Grade 2">Grade 2</option>
                <option value="Grade 3">Grade 3</option>
                <option value="Grade 4">Grade 4</option>
                <option value="Grade 5">Grade 5</option>
                <option value="Grade 6">Grade 6</option>
                <option value="Junior High 1">Junior High 1</option>
                <option value="Junior High 2">Junior High 2</option>
                <option value="Junior High 3">Junior High 3</option>
                <option value="Senior High 1">Senior High 1</option>
                <option value="Senior High 2">Senior High 2</option>
                <option value="Senior High 3">Senior High 3</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted mb-1 block">Full Student Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Ama Serwaa Mensah"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              className="input-field w-full"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted mb-1 block">Guardian Full Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. Mr. Kwame Mensah"
                value={form.guardianName}
                onChange={(e) => setForm({ ...form, guardianName: e.target.value })}
                className="input-field w-full"
              />
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Guardian Phone Number *</label>
              <input
                type="text"
                required
                placeholder="e.g. 0541234567"
                value={form.guardianPhone}
                onChange={(e) => setForm({ ...form, guardianPhone: e.target.value })}
                className="input-field w-full"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted mb-1 block">Guardian Email</label>
            <input
              type="email"
              placeholder="guardian@example.com"
              value={form.guardianEmail}
              onChange={(e) => setForm({ ...form, guardianEmail: e.target.value })}
              className="input-field w-full"
            />
          </div>

          <div>
            <label className="text-xs text-muted mb-1 block">Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as any })}
              className="input-field w-full bg-surface"
            >
              <option value="active">Active</option>
              <option value="graduated">Graduated</option>
              <option value="withdrawn">Withdrawn</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <button type="button" onClick={() => setIsAddOpen(false)} className="btn-ghost">
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              {editingStudent ? "Save Changes" : "Register Student"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={isParentModalOpen} onClose={() => setIsParentModalOpen(false)} title={`Parent access · ${selectedParentStudent?.fullName || "Student"}`}>
        <form onSubmit={handleCreateParentLink} className="space-y-4">
          <p className="text-xs text-muted">The guardian can sign in with this email to view only the linked student’s attendance, fees, report cards, and notifications.</p>
          <div><label className="text-xs text-muted mb-1 block">Guardian name</label><input className="input-field w-full" value={parentForm.parentName} onChange={(e) => setParentForm({ ...parentForm, parentName: e.target.value })} /></div>
          <div><label className="text-xs text-muted mb-1 block">Guardian email *</label><input className="input-field w-full" type="email" required value={parentForm.parentEmail} onChange={(e) => setParentForm({ ...parentForm, parentEmail: e.target.value })} /></div>
          <div><label className="text-xs text-muted mb-1 block">Guardian phone</label><input className="input-field w-full" value={parentForm.parentPhone} onChange={(e) => setParentForm({ ...parentForm, parentPhone: e.target.value })} /></div>
          <div className="flex justify-end gap-3 pt-4 border-t border-border"><button type="button" onClick={() => setIsParentModalOpen(false)} className="btn-ghost">Cancel</button><button type="submit" className="btn-primary">Create portal access</button></div>
        </form>
      </Modal>
    </div>
  );
}
