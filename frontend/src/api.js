import { FALLBACK_ADMIN, FALLBACK_STUDENT } from "./fallbackData.js";

// In dev, Vite proxies /api -> http://localhost:8000. In a production build you
// can point this at an absolute URL via VITE_API_BASE.
const BASE = import.meta.env.VITE_API_BASE ?? "";

async function getJson(path, fallback) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { data: await res.json(), offline: false };
  } catch (err) {
    console.warn(`[api] ${path} failed, using fallback data:`, err.message);
    return { data: fallback, offline: true };
  }
}

// The academics tree is the heaviest endpoint and several pages read it on
// mount. Cache it briefly so navigating between admin pages doesn't refetch it
// every time; any write clears the cache.
let _treeCache = null;
export function clearAcademicsCache() {
  _treeCache = null;
}

async function mutate(path, method, body) {
  clearAcademicsCache();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = j.detail || JSON.stringify(j);
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new Error(detail || `${method} ${path} → ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

// ---- dashboards --------------------------------------------------------- //

export const fetchAdminDashboard = () =>
  getJson("/api/admin/dashboard", FALLBACK_ADMIN);

export const fetchStudentDashboard = () =>
  getJson("/api/student/dashboard", FALLBACK_STUDENT);

export const fetchAdminOverview = () => getJson("/api/admin/overview", null);

// ---- examinations ---------------------------------------------------- //

export const fetchExamResults = (classId = "", assignmentId = "") =>
  getJson(
    `/api/exam/results?class_id=${encodeURIComponent(classId)}&assignment_id=${encodeURIComponent(
      assignmentId
    )}`,
    { results: [] }
  );

export const fetchExamAttempt = (attemptId) =>
  getJson(`/api/exam/attempts/${attemptId}`, null);

export const examExportUrl = (classId = "", assignmentId = "") =>
  `${BASE}/api/exam/export?class_id=${encodeURIComponent(classId)}&assignment_id=${encodeURIComponent(
    assignmentId
  )}`;

// ---- tests / assignment catalog (names, chapters, direct links) -------- //

export const fetchTests = (classId = "") =>
  getJson(`/api/reports/tests?class_id=${encodeURIComponent(classId)}`, { tests: [] });

export const testsExportUrl = (classId = "") =>
  `${BASE}/api/reports/tests/export?class_id=${encodeURIComponent(classId)}`;

// ---- academic structure (classes / sections / subjects / topics) ------- //

export function fetchAcademicsTree() {
  if (_treeCache && Date.now() - _treeCache.at < 4000) return _treeCache.promise;
  const promise = getJson("/api/academics/tree", { classes: [], backend: "offline" });
  _treeCache = { at: Date.now(), promise };
  return promise;
}

export const addClass = (name) =>
  mutate("/api/academics/classes", "POST", { name });
export const deleteClass = (id) =>
  mutate(`/api/academics/classes/${id}`, "DELETE");

export const addSection = (class_id, name) =>
  mutate("/api/academics/sections", "POST", { class_id, name });
export const deleteSection = (id) =>
  mutate(`/api/academics/sections/${id}`, "DELETE");

export const addSubject = (class_id, name) =>
  mutate("/api/academics/subjects", "POST", { class_id, name });
export const deleteSubject = (id) =>
  mutate(`/api/academics/subjects/${id}`, "DELETE");

export const addTopic = (subject_id, name, description = "") =>
  mutate("/api/academics/topics", "POST", { subject_id, name, description });
export const deleteTopic = (id) =>
  mutate(`/api/academics/topics/${id}`, "DELETE");

// ---- assignments & questions ----------------------------------------- //

export const fetchAssignment = (id) =>
  getJson(`/api/academics/assignments/${id}`, null);

export const addAssignment = (topic_id, title, instructions = "", max_attempts = 1) =>
  mutate("/api/academics/assignments", "POST", {
    topic_id,
    title,
    instructions,
    max_attempts,
  });
export const updateAssignment = (id, title, instructions = "", max_attempts = 1) =>
  mutate(`/api/academics/assignments/${id}`, "PATCH", {
    title,
    instructions,
    max_attempts,
  });
export const deleteAssignment = (id) =>
  mutate(`/api/academics/assignments/${id}`, "DELETE");

export const addQuestion = (assignment_id, q) =>
  mutate("/api/academics/questions", "POST", { assignment_id, ...q });
export const updateQuestion = (id, q) =>
  mutate(`/api/academics/questions/${id}`, "PATCH", q);
export const deleteQuestion = (id) =>
  mutate(`/api/academics/questions/${id}`, "DELETE");

// ---- students ------------------------------------------------------- //

export const fetchStudents = () =>
  getJson("/api/students", { students: [], backend: "offline" });
export const addStudent = (s) => mutate("/api/students", "POST", s);
export const updateStudent = (id, s) => mutate(`/api/students/${id}`, "PATCH", s);
export const deleteStudent = (id) => mutate(`/api/students/${id}`, "DELETE");
export const promoteClass = (from_class_id, to_class_id) =>
  mutate("/api/students/promote", "POST", { from_class_id, to_class_id });

// ---- file uploads -------------------------------------------------- //

async function uploadFile(path, file) {
  clearAcademicsCache();
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}${path}`, { method: "POST", body: form });
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.json()).detail;
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new Error(detail || `Upload failed (${res.status})`);
  }
  return res.json();
}

export const bulkUploadQuestions = (assignment_id, file) =>
  uploadFile(`/api/academics/assignments/${assignment_id}/questions/bulk`, file);

export const bulkUploadStudents = (file) =>
  uploadFile("/api/students/bulk", file);

// ---- settings / feature flags ------------------------------------- //

export const fetchSettings = () =>
  getJson("/api/settings", { flags: {}, meta: {}, backend: "offline" });
export const saveSettings = (flags) => mutate("/api/settings", "PUT", { flags });

// ---- student portal --------------------------------------------- //

export async function portalLogin(studentId) {
  const res = await fetch(
    `${BASE}/api/portal/login/${encodeURIComponent(studentId)}`,
    { headers: { Accept: "application/json" } }
  );
  if (res.status === 404) throw new Error("No student found with that ID.");
  if (!res.ok) throw new Error(`Login failed (${res.status})`);
  return (await res.json()).student;
}

export const fetchPortalDashboard = (studentId) =>
  getJson(`/api/portal/dashboard?student_id=${encodeURIComponent(studentId)}`, null);

export const fetchPortalAssignment = (assignmentId, studentId) =>
  getJson(
    `/api/portal/assignments/${assignmentId}?student_id=${encodeURIComponent(studentId)}`,
    null
  );

export const submitPortalAttempt = (assignmentId, studentId, answers) =>
  mutate(`/api/portal/assignments/${assignmentId}/attempt`, "POST", {
    student_id: studentId,
    answers,
  });

// ---- new-student leads ------------------------------------------------- //

export const createLead = (lead) => mutate("/api/leads", "POST", lead);

export const fetchLeads = (fromDate = "", toDate = "") =>
  getJson(
    `/api/leads?from_date=${encodeURIComponent(fromDate)}&to_date=${encodeURIComponent(toDate)}`,
    { leads: [] }
  );

export const leadsExportUrl = (fromDate = "", toDate = "") =>
  `${BASE}/api/leads/export?from_date=${encodeURIComponent(fromDate)}&to_date=${encodeURIComponent(
    toDate
  )}`;
