import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { SettingsProvider } from "./settings.jsx";
import { StudentAuthProvider } from "./studentAuth.jsx";
import "./styles.css";

// Note: React.StrictMode is intentionally omitted — in dev it double-invokes
// effects, which doubled every page's API calls and made the app feel slow.
ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <SettingsProvider>
      <StudentAuthProvider>
        <App />
      </StudentAuthProvider>
    </SettingsProvider>
  </BrowserRouter>
);
