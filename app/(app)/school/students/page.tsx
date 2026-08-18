"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { Student, getStudents, createStudent, updateStudent, deleteStudent } from "@/lib/school-db";
import { BusinessProfile, getBusinessProfile } from "@/lib/db";
import { toast } from "react-hot-toast";
import { Users, UserPlus, Search, Edit, Trash2, GraduationCap, X, Check } from "lucide-react";
import Modal from "@/components/ui/Modal";

export default function StudentsPage() {
  const { businessId, role } = useAuth();
  const propertyId = "default_property";
  const [students, setStudents] = useState<Student[]>([]);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
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
    const [stList, prof] = await Promise.all([
      getStudents(businessId, propertyId),
      getBusinessProfile(businessId),
    ]);
    setStudents(stList);
    setBusinessProfile(prof);
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
        await createStudent({
          businessId,
          propertyId: propertyId || "default_property",
          ...form,
        });
        toast.success("Student registered successfully.");
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
              admissionNumber: `ADM-${Math.floor(1000 + Math.random() * 9000)}`,
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
            placeholder="Search by student name, admission #, or class..."
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
                <th className="py-3 px-4">Admission #</th>
                <th className="py-3 px-4">Student Name</th>
                <th className="py-3 px-4">Class / Grade</th>
                <th className="py-3 px-4">Guardian Name</th>
                <th className="py-3 px-4">Guardian Phone</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-sm">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted">
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
              <label className="text-xs text-muted mb-1 block">Admission Number *</label>
              <input
                type="text"
                required
                value={form.admissionNumber}
                onChange={(e) => setForm({ ...form, admissionNumber: e.target.value })}
                className="input-field w-full font-mono"
              />
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
    </div>
  );
}
