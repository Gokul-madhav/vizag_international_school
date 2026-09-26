import { createContext, useCallback, useContext, useState } from "react";

const KEY = "vis_admin_ok";
const ADMIN_ID = "040506";

function readStored() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

const AdminAuthContext = createContext({
  authed: false,
  login: () => false,
  logout: () => {},
});

export function AdminAuthProvider({ children }) {
  const [authed, setAuthed] = useState(readStored);

  const login = useCallback((id) => {
    const ok = (id || "").trim() === ADMIN_ID;
    if (ok) {
      try {
        localStorage.setItem(KEY, "1");
      } catch {}
      setAuthed(true);
    }
    return ok;
  }, []);

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(KEY);
    } catch {}
    setAuthed(false);
  }, []);

  return (
    <AdminAuthContext.Provider value={{ authed, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export const useAdminAuth = () => useContext(AdminAuthContext);
