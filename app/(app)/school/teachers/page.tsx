"use client";

// BillFlow School Teachers: teacher-centric assignment workspace using existing Staff
// accounts and SchoolClass records. It does not create a parallel teacher identity
// system; assignments remain on the property-scoped schoolClasses records.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Check,
  GraduationCap,
  Link2,
  RefreshCw,
  Search,
  UserRound,
  Users,
  UserPlus,
  X,
} from "lucide-react";
import toast from "react-hot-toast";
import Modal from "@/components/ui/Modal";
import { useAuth } from "@/lib/auth-context";
import { BusinessProfile, getBusinessProfile, getStaff, Staff } from "@/lib/db";
import {
  DEFAULT_PROPERTY_ID,
  getSchoolClasses,
  getStudents,
  saveSchoolClass,
  SchoolClass,
  Student,
} from "@/lib/school-db";

interface ClassGroup {
  name: string;
  studentCount: number;
  activeStudentCount: number;
  schoolClass?: SchoolClass;
}

export default function SchoolTeachersPage() {
  const { businessId, role, propertyId: authPropertyId, user } = useAuth();
  const propertyId = authPropertyId || DEFAULT_PROPERTY_ID;
  const [staff, setStaff] = useState<Staff[]>([]);
  const [schoolClasses, setSchoolClasses] = useState<SchoolClass[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [classSelections, setClassSelections] = useState<Record<string, string>>({});
  const [savingClass, setSavingClass] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [teacherForm, setTeacherForm] = useState({
    displayName: "",
    email: "",
    phone: "",
    employeeId: "",
    subjectSpecialty: "",
  });

  const load = async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const [staffList, classList, studentList, profile] = await Promise.all([
        getStaff(businessId),
        getSchoolClasses(businessId, propertyId),
        getStudents(businessId, propertyId),
        getBusinessProfile(businessId),
      ]);
      setStaff(staffList);
      setSchoolClasses(classList);
      setStudents(studentList);
      setBusinessProfile(profile);
      setClassSelections((current) => {
        const next = { ...current };
        classList.forEach((schoolClass) => {
          next[schoolClass.name] = schoolClass.teacherId || "";
        });
        return next;
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load teachers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [businessId, propertyId]);

  const activeStaff = useMemo(
    () => staff.filter((member) => member.status === "active"),
    [staff],
  );

  const assignableStaff = useMemo(
    () => staff.filter((member) => member.status === "active" || member.staffType === "teacher"),
    [staff],
  );

  const classGroups = useMemo<ClassGroup[]>(() => {
    const byName = new Map<string, Student[]>();
    students.forEach((student) => {
      const name = student.classGrade?.trim() || "Unassigned";
      const group = byName.get(name) || [];
      group.push(student);
      byName.set(name, group);
    });

    const names = new Set([
      ...Array.from(byName.keys()).filter((name) => name !== "Unassigned"),
      ...schoolClasses.map((schoolClass) => schoolClass.name),
    ]);

    return Array.from(names)
      .map((name) => {
        const classStudents = byName.get(name) || [];
        return {
          name,
          studentCount: classStudents.length,
          activeStudentCount: classStudents.filter((student) => student.status === "active").length,
          schoolClass: schoolClasses.find((schoolClass) => schoolClass.name === name),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [schoolClasses, students]);

  const filteredStaff = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return assignableStaff;
    return assignableStaff.filter((member) =>
      [member.displayName, member.email, member.employeeId, member.subjectSpecialty]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [assignableStaff, searchTerm]);

  const assignedClassCount = useMemo(
    () => classGroups.filter((group) => Boolean(group.schoolClass?.teacherId)).length,
    [classGroups],
  );

  const assignedTeacherIds = useMemo(
    () => new Set(classGroups.map((group) => group.schoolClass?.teacherId).filter(Boolean)),
    [classGroups],
  );

  const resetTeacherForm = () => {
    setTeacherForm({ displayName: "", email: "", phone: "", employeeId: "", subjectSpecialty: "" });
  };

  const handleCreateTeacher = async () => {
    if (!businessId || businessId === "SUPER_ADMIN") {
      toast.error("Select a specific school business before creating a teacher profile");
      return;
    }
    if (!user) {
      toast.error("Your session has expired. Please sign in again");
      return;
    }

    setCreateSaving(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/school/teachers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ...teacherForm, businessId, propertyId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || "Could not create teacher profile");
      }

      toast.success(`${teacherForm.displayName.trim()} teacher profile created`);
      setCreateOpen(false);
      resetTeacherForm();
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create teacher profile");
    } finally {
      setCreateSaving(false);
    }
  };

  const saveTeacherAssignment = async (group: ClassGroup) => {
    if (!businessId) return;
    const teacherId = classSelections[group.name] || "";
    const teacher = assignableStaff.find((member) => member.id === teacherId);
    setSavingClass(group.name);
    try {
      await saveSchoolClass({
        businessId,
        propertyId,
        name: group.name,
        teacherId: teacher?.id,
        teacherName: teacher?.displayName || teacher?.email,
        teacherEmail: teacher?.email,
      });
      toast.success(
        teacher ? `${teacher.email} assigned to ${group.name}` : `Teacher cleared for ${group.name}`,
      );
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save teacher assignment");
    } finally {
      setSavingClass(null);
    }
  };

  if (role !== "owner" && role !== "super_admin") {
    return (
      <div className="card max-w-xl">
        <p className="text-muted">Teachers are available to school owners and Super Admin users.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-gold mb-2">School Management</p>
          <h1 className="text-3xl font-grotesk font-semibold text-white flex items-center gap-2">
            <GraduationCap className="text-gold" /> Teachers
          </h1>
          <p className="text-sm text-muted mt-2">
            {businessProfile?.businessName || "School"} · {propertyId} · Assign active staff members to property-scoped classes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search teachers..."
              className="input-field pl-9 w-[220px]"
              aria-label="Search teachers"
            />
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            disabled={!businessId || businessId === "SUPER_ADMIN"}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            <UserPlus size={15} /> Add teacher
          </button>
          <Link href="/staff" className="btn-ghost flex items-center gap-2">
            <UserPlus size={15} /> Manage staff
          </Link>
          <button onClick={load} disabled={loading} className="btn-primary flex items-center gap-2">
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card py-16 text-center text-muted">Loading teachers and class assignments…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="card">
              <p className="text-xs text-muted flex items-center gap-2"><Users size={14} /> Active staff</p>
              <p className="text-2xl text-white font-semibold mt-2">{activeStaff.length}</p>
            </div>
            <div className="card">
              <p className="text-xs text-muted flex items-center gap-2"><GraduationCap size={14} /> Classes in scope</p>
              <p className="text-2xl text-white font-semibold mt-2">{classGroups.length}</p>
            </div>
            <div className="card">
              <p className="text-xs text-muted flex items-center gap-2"><Link2 size={14} /> Assigned classes</p>
              <p className="text-2xl text-emerald-300 font-semibold mt-2">{assignedClassCount}</p>
            </div>
            <div className="card">
              <p className="text-xs text-muted flex items-center gap-2"><UserRound size={14} /> Teachers assigned</p>
              <p className="text-2xl text-gold font-semibold mt-2">{assignedTeacherIds.size}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-6 items-start">
            <section className="card">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h2 className="font-grotesk font-semibold text-white">Teacher roster</h2>
                  <p className="text-xs text-muted mt-1">Active staff accounts available for class assignment.</p>
                </div>
                <span className="text-xs text-muted">{filteredStaff.length}</span>
              </div>
              {filteredStaff.length === 0 ? (
                <div className="border border-dashed border-border p-5 text-center">
                  <UserRound className="mx-auto text-muted mb-2" size={24} />
                  <p className="text-sm text-muted">No active staff members match this search.</p>
                  <Link href="/staff" className="inline-flex items-center gap-2 text-xs text-gold hover:underline mt-3">
                    <UserPlus size={13} /> Invite staff
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredStaff.map((member) => {
                    const assignedClasses = classGroups.filter((group) => group.schoolClass?.teacherId === member.id);
                    const teacherName = member.displayName || member.email;
                    return (
                      <div key={member.id || member.email} className="border border-border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm text-white font-medium truncate">{teacherName}</p>
                            <p className="text-xs text-muted mt-1 truncate">
                              {member.email}
                              {member.employeeId ? ` · ${member.employeeId}` : ""}
                              {member.subjectSpecialty ? ` · ${member.subjectSpecialty}` : ""}
                            </p>
                          </div>
                          <span className={`text-[10px] uppercase tracking-wider border px-2 py-1 ${member.status === "active" ? "text-emerald-300 border-emerald-300/30" : "text-gold border-gold/30"}`}>
                            {member.status === "active" ? "Active" : "Pending"}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {assignedClasses.length === 0 ? (
                            <span className="text-xs text-muted">No class assigned</span>
                          ) : assignedClasses.map((group) => (
                            <span key={group.name} className="text-xs text-gold bg-gold/10 px-2 py-1">{group.name}</span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="card p-0 overflow-hidden">
              <div className="p-5 border-b border-border flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-grotesk font-semibold text-white">Assign teachers to classes</h2>
                  <p className="text-xs text-muted mt-1">Assignments are saved to the selected property and reflected on the Classes page.</p>
                </div>
                <Link href="/school/classes" className="text-xs text-gold hover:underline whitespace-nowrap">Open classes</Link>
              </div>
              {classGroups.length === 0 ? (
                <div className="p-10 text-center">
                  <GraduationCap className="mx-auto text-muted mb-3" size={28} />
                  <p className="text-sm text-muted">Create a class or register a student with a class before assigning teachers.</p>
                  <Link href="/school/classes" className="inline-flex items-center gap-2 btn-primary mt-4">Manage classes</Link>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-white/[0.03] text-xs text-muted uppercase tracking-wider">
                      <tr>
                        <th className="text-left font-medium px-5 py-3">Class</th>
                        <th className="text-left font-medium px-5 py-3">Students</th>
                        <th className="text-left font-medium px-5 py-3 min-w-[260px]">Assigned teacher</th>
                        <th className="text-right font-medium px-5 py-3">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {classGroups.map((group) => {
                        const currentTeacherId = classSelections[group.name] || "";
                        const changed = currentTeacherId !== (group.schoolClass?.teacherId || "");
                        return (
                          <tr key={group.name} className="hover:bg-white/[0.02]">
                            <td className="px-5 py-4">
                              <p className="text-white font-medium">{group.name}</p>
                              <p className="text-xs text-muted mt-1">{group.activeStudentCount} active students</p>
                            </td>
                            <td className="px-5 py-4 text-surface">{group.studentCount}</td>
                            <td className="px-5 py-4">
                              <select
                                value={currentTeacherId}
                                onChange={(event) => setClassSelections((current) => ({ ...current, [group.name]: event.target.value }))}
                                className="input-field w-full"
                                aria-label={`Assign teacher to ${group.name}`}
                              >
                                <option value="">Unassigned</option>
                                {assignableStaff.map((member) => (
                                  <option key={member.id || member.email} value={member.id || ""}>
                                    {member.displayName ? `${member.displayName} · ${member.email}` : member.email}
                                  </option>
                                ))}
                              </select>
                              {group.schoolClass?.teacherEmail && !assignableStaff.some((member) => member.id === group.schoolClass?.teacherId) && (
                                <p className="text-xs text-amber-300 mt-2">Previously assigned to {group.schoolClass.teacherEmail}; choose an available account to replace it.</p>
                              )}
                            </td>
                            <td className="px-5 py-4 text-right">
                              <button
                                onClick={() => saveTeacherAssignment(group)}
                                disabled={!changed || savingClass === group.name}
                                className="btn-primary inline-flex items-center gap-2 disabled:opacity-50"
                              >
                                {currentTeacherId ? <Check size={14} /> : <X size={14} />}
                                {savingClass === group.name ? "Saving…" : "Save"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </>
      )}

      <Modal
        open={createOpen}
        onClose={() => {
          if (!createSaving) {
            setCreateOpen(false);
            resetTeacherForm();
          }
        }}
        title="Create Teacher Profile"
      >
        <div className="space-y-4">
          <p className="text-xs text-muted">
            Create a property-scoped teacher profile. The profile starts as pending until the teacher signs in or is invited through staff access.
          </p>
          <div>
            <label className="label" htmlFor="teacher-display-name">Full name *</label>
            <input
              id="teacher-display-name"
              className="input"
              value={teacherForm.displayName}
              onChange={(event) => setTeacherForm((current) => ({ ...current, displayName: event.target.value }))}
              placeholder="e.g. Ama Mensah"
              autoComplete="name"
            />
          </div>
          <div>
            <label className="label" htmlFor="teacher-email">Email address *</label>
            <input
              id="teacher-email"
              className="input"
              type="email"
              value={teacherForm.email}
              onChange={(event) => setTeacherForm((current) => ({ ...current, email: event.target.value }))}
              placeholder="teacher@school.com"
              autoComplete="email"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="teacher-phone">Phone</label>
              <input
                id="teacher-phone"
                className="input"
                value={teacherForm.phone}
                onChange={(event) => setTeacherForm((current) => ({ ...current, phone: event.target.value }))}
                placeholder="024 000 0000"
                autoComplete="tel"
              />
            </div>
            <div>
              <label className="label" htmlFor="teacher-employee-id">Employee ID</label>
              <input
                id="teacher-employee-id"
                className="input"
                value={teacherForm.employeeId}
                onChange={(event) => setTeacherForm((current) => ({ ...current, employeeId: event.target.value }))}
                placeholder="TCH-001"
              />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="teacher-specialty">Subject or specialty</label>
            <input
              id="teacher-specialty"
              className="input"
              value={teacherForm.subjectSpecialty}
              onChange={(event) => setTeacherForm((current) => ({ ...current, subjectSpecialty: event.target.value }))}
              placeholder="Mathematics"
            />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button
              className="btn-ghost"
              onClick={() => {
                setCreateOpen(false);
                resetTeacherForm();
              }}
              disabled={createSaving}
            >
              Cancel
            </button>
            <button className="btn-primary" onClick={handleCreateTeacher} disabled={createSaving}>
              {createSaving ? "Creating…" : "Create teacher"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
