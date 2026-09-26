import { NavLink } from "react-router-dom";
import { useSettings } from "../settings.jsx";
import {
  IconBook,
  IconCalendar,
  IconChart,
  IconClipboard,
  IconGrid,
  IconHelp,
  IconMessage,
  IconSettings,
  IconUsers,
  IconWallet,
} from "./Icons.jsx";

// `soon: true` -> routes to the "under construction" placeholder.
const MENUS = {
  admin: {
    main: [
      { label: "Dashboard", icon: IconGrid, to: "/admin", end: true },
      { label: "Classes & Sections", icon: IconClipboard, to: "/admin/academics", flag: "academics" },
      { label: "Students", icon: IconUsers, to: "/admin/students", flag: "students" },
      { label: "New Students", icon: IconUsers, to: "/admin/new-students" },
      { label: "Teachers", icon: IconBook, to: "/admin/teachers", soon: true },
      { label: "Timetable", icon: IconCalendar, to: "/admin/timetable", soon: true },
      { label: "Examinations", icon: IconChart, to: "/admin/examinations" },
      { label: "Tests & Links", icon: IconClipboard, to: "/admin/tests" },
    ],
    others: [
      { label: "Fees & Finance", icon: IconWallet, to: "/admin/fees", soon: true },
      { label: "Announcements", icon: IconMessage, to: "/admin/announcements", soon: true },
      { label: "Settings", icon: IconSettings, to: "/admin/settings" },
      { label: "Help Center", icon: IconHelp, to: "/admin/help", soon: true },
    ],
  },
  student: {
    main: [
      { label: "Dashboard", icon: IconGrid, to: "/student", end: true },
      { label: "My Courses", icon: IconBook, to: "/student/courses", soon: true },
      { label: "Timetable", icon: IconCalendar, to: "/student/timetable", soon: true },
      { label: "Assignments", icon: IconClipboard, to: "/student/assignments" },
      { label: "Exams & Results", icon: IconChart, to: "/student/results", soon: true },
      { label: "Attendance", icon: IconUsers, to: "/student/attendance", soon: true },
    ],
    others: [
      { label: "Messages", icon: IconMessage, to: "/student/messages", soon: true },
      { label: "Settings", icon: IconSettings, to: "/student/settings", soon: true },
      { label: "Help Center", icon: IconHelp, to: "/student/help", soon: true },
    ],
  },
};

function Group({ label, items, flags }) {
  const shown = items.filter((it) => {
    if (it.flag && flags[it.flag] === false) return false;
    if (it.soon && flags.under_construction === false) return false;
    return true;
  });
  if (shown.length === 0) return null;
  return (
    <div className="nav-group">
      <div className="nav-group__label">{label}</div>
      {shown.map((it) => {
        const Icon = it.icon;
        return (
          <NavLink
            key={it.label}
            to={it.to}
            end={it.end}
            className={({ isActive }) =>
              `nav-item ${isActive ? "nav-item--active" : ""}`
            }
          >
            <Icon className="nav-item__icon" />
            <span className="nav-item__label">{it.label}</span>
            {it.soon && <span className="nav-badge">Soon</span>}
          </NavLink>
        );
      })}
    </div>
  );
}

export default function Sidebar({ role, open }) {
  const menu = MENUS[role];
  const { flags } = useSettings();
  return (
    <aside className={`sidebar ${open ? "sidebar--open" : ""}`}>
      <div className="brand">
        <div className="brand__mark">V</div>
        <div className="brand__name">VIZAG INT'L</div>
      </div>

      <Group label="Menu" items={menu.main} flags={flags} />
      <Group label="Others" items={menu.others} flags={flags} />

      <div className="sidebar__spacer" />
    </aside>
  );
}
