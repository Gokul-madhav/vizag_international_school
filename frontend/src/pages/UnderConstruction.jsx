import { Link, useLocation } from "react-router-dom";

const LABELS = {
  students: "Students",
  teachers: "Teachers",
  timetable: "Timetable",
  examinations: "Examinations",
  fees: "Fees & Finance",
  announcements: "Announcements",
  settings: "Settings",
  help: "Help Center",
  courses: "My Courses",
  assignments: "Assignments",
  results: "Exams & Results",
  attendance: "Attendance",
  messages: "Messages",
};

export default function UnderConstruction() {
  const { pathname } = useLocation();
  const [role = "admin", slug = ""] = pathname.split("/").filter(Boolean);
  const label = LABELS[slug] || slug.replace(/-/g, " ") || "This section";

  return (
    <div className="under-construction">
      <div className="uc-emoji">🚧</div>
      <h1 className="page-title">{label}</h1>
      <p className="page-sub">This section is under construction.</p>
      <p className="uc-text">
        We&rsquo;re still building this part of the {role} portal. The working
        areas right now are the <strong>Dashboard</strong>
        {role === "admin" && (
          <>
            {" "}
            and <strong>Classes &amp; Sections</strong>
          </>
        )}
        .
      </p>
      <Link className="btn-primary" to={`/${role}`}>
        Back to dashboard
      </Link>
    </div>
  );
}
