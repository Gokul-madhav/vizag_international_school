import { IconBell, IconMenu, IconSearch } from "./Icons.jsx";

export default function Topbar({ user, onMenu }) {
  return (
    <header className="topbar">
      <button className="hamburger" onClick={onMenu} aria-label="Open menu">
        <IconMenu />
      </button>

      <div className="search">
        <span className="search__icon">
          <IconSearch />
        </span>
        <input placeholder="Search students, classes, reports…" />
      </div>

      <div className="topbar__right">
        <span className="bell" aria-label="Notifications">
          <IconBell />
        </span>
        <div className="user-chip">
          <div className="avatar">{user.avatar}</div>
          <span>{user.name}</span>
        </div>
      </div>
    </header>
  );
}
