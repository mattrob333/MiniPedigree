import { useEffect, useMemo, useState } from "react";

export type ThemePref = "light" | "dark" | "system";

function systemPrefersLight(): boolean {
  try {
    return window.matchMedia("(prefers-color-scheme: light)").matches;
  } catch {
    return false;
  }
}

export function useTheme(): [ThemePref, (p: ThemePref) => void, "light" | "dark"] {
  const [pref, setPref] = useState<ThemePref>(() => {
    try {
      return (localStorage.getItem("pedigree.theme") as ThemePref) || "dark";
    } catch {
      return "dark";
    }
  });
  const [systemLight, setSystemLight] = useState<boolean>(systemPrefersLight);

  const resolved = useMemo<"light" | "dark">(() => {
    if (pref === "system") return systemLight ? "light" : "dark";
    return pref;
  }, [pref, systemLight]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolved);
    try {
      localStorage.setItem("pedigree.theme", pref);
    } catch {
      /* ignore */
    }
  }, [resolved, pref]);

  useEffect(() => {
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => setSystemLight(mq.matches);
    onChange(); // sync in case it changed while pref wasn't "system"
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  return [pref, setPref, resolved];
}
