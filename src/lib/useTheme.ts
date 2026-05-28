import { useEffect, useMemo, useState } from "react";

export type ThemePref = "light" | "dark" | "system";

export function useTheme(): [ThemePref, (p: ThemePref) => void, "light" | "dark"] {
  const [pref, setPref] = useState<ThemePref>(() => {
    try {
      return (localStorage.getItem("pedigree.theme") as ThemePref) || "dark";
    } catch {
      return "dark";
    }
  });

  const resolved = useMemo<"light" | "dark">(() => {
    if (pref === "system") {
      try {
        return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
      } catch {
        return "dark";
      }
    }
    return pref;
  }, [pref]);

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
    const onChange = () =>
      document.documentElement.setAttribute("data-theme", mq.matches ? "light" : "dark");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  return [pref, setPref, resolved];
}
