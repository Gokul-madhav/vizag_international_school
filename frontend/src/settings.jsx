import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { fetchSettings, saveSettings } from "./api.js";

export const FLAG_DEFAULTS = {
  academics: true,
  students: true,
  assignments: true,
  bulk_import: true,
  student_portal: true,
  activity_feed: true,
  under_construction: true,
  whatsapp_bot: true,
};

const SettingsContext = createContext({
  flags: FLAG_DEFAULTS,
  meta: {},
  backend: "offline",
  loaded: false,
  reload: async () => {},
  save: async () => {},
});

export function SettingsProvider({ children }) {
  const [flags, setFlags] = useState(FLAG_DEFAULTS);
  const [meta, setMeta] = useState({});
  const [backend, setBackend] = useState("offline");
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    const { data } = await fetchSettings();
    setFlags({ ...FLAG_DEFAULTS, ...(data.flags || {}) });
    setMeta(data.meta || {});
    setBackend(data.backend || "offline");
    setLoaded(true);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const save = useCallback(async (next) => {
    const res = await saveSettings(next);
    setFlags({ ...FLAG_DEFAULTS, ...(res.flags || {}) });
    if (res.meta) setMeta(res.meta);
    return res.flags;
  }, []);

  return (
    <SettingsContext.Provider value={{ flags, meta, backend, loaded, reload, save }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
