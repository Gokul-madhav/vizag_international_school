import { Link } from "react-router-dom";
import { useSettings } from "../settings.jsx";

export default function FeatureDisabled({ flag }) {
  const { meta } = useSettings();
  const label = meta[flag]?.label || "This feature";

  return (
    <div className="under-construction">
      <div className="uc-emoji">🔒</div>
      <h1 className="page-title">{label} is turned off</h1>
      <p className="page-sub">An administrator has disabled this feature.</p>
      <p className="uc-text">
        It can be switched back on from <strong>Settings</strong> in the admin
        panel.
      </p>
      <Link className="btn-primary" to="/admin/settings">
        Open Settings
      </Link>
    </div>
  );
}
