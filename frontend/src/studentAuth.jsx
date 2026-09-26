import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { portalLogin } from "./api.js";

const KEY = "vis_student_id";

function readStored() {
  try {
    return localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

const StudentAuthContext = createContext({
  studentId: "",
  student: null,
  loading: true,
  login: async () => {},
  logout: () => {},
});

export function StudentAuthProvider({ children }) {
  const [studentId, setStudentId] = useState(readStored);
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(Boolean(readStored()));

  // Validate a stored id on first load.
  useEffect(() => {
    let alive = true;
    const id = readStored();
    if (!id) {
      setLoading(false);
      return;
    }
    portalLogin(id)
      .then((s) => {
        if (alive) setStudent(s);
      })
      .catch(() => {
        if (!alive) return;
        try {
          localStorage.removeItem(KEY);
        } catch {}
        setStudentId("");
        setStudent(null);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const login = useCallback(async (id) => {
    const s = await portalLogin(id.trim());
    try {
      localStorage.setItem(KEY, s.student_id);
    } catch {}
    setStudentId(s.student_id);
    setStudent(s);
    return s;
  }, []);

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(KEY);
    } catch {}
    setStudentId("");
    setStudent(null);
  }, []);

  return (
    <StudentAuthContext.Provider value={{ studentId, student, loading, login, logout }}>
      {children}
    </StudentAuthContext.Provider>
  );
}

export const useStudentAuth = () => useContext(StudentAuthContext);
