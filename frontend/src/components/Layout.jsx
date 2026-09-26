import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import Sidebar from "./Sidebar.jsx";
import Topbar from "./Topbar.jsx";
import { useStudentAuth } from "../studentAuth.jsx";

const ADMIN_USER = { name: "Principal's Office", avatar: "VIS" };

function initials(name = "") {
  return (
    name
      .split(" ")
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "S"
  );
}

export default function Layout({ role, children }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { pathname } = useLocation();
  const { student } = useStudentAuth();

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Before the student signs in there's no dashboard chrome — just the
  // centred sign-in card on a bare page.
  if (role === "student" && !student) {
    return <div className="bare-page">{children}</div>;
  }

  const user =
    role === "student"
      ? { name: student.name, avatar: initials(student.name) }
      : ADMIN_USER;

  return (
    <div className="layout">
      <Sidebar role={role} open={drawerOpen} />
      <div
        className={`overlay ${drawerOpen ? "overlay--show" : ""}`}
        onClick={() => setDrawerOpen(false)}
      />

      <div className="main">
        <Topbar user={user} onMenu={() => setDrawerOpen((v) => !v)} />
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
