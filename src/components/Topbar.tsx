import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import type { ThemePref } from "@/lib/useTheme";

interface TopbarProps {
  screen: "login" | "upload" | "workspace" | "manifest";
  workspaceName: string;
  agentName?: string;
  themePref: ThemePref;
  setThemePref: (p: ThemePref) => void;
  resolvedTheme: "light" | "dark";
  onHome?: () => void;
  onWorkspace?: () => void;
  userInitials?: string;
  onSignOut?: () => void;
}

export function Topbar({ screen, workspaceName, agentName, themePref, setThemePref, resolvedTheme, onHome, onWorkspace, userInitials, onSignOut }: TopbarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <header className="topbar">
      <div className="brand" onClick={onHome} style={onHome ? { cursor: "pointer" } : undefined} title={onHome ? "Home" : undefined}>
        <div className="brand-mark">PD</div>
        <div className="brand-text">
          <span className="name">Pedigree</span>
          <span className="tag" style={{ background: "transparent", border: 0, padding: 0, fontSize: 10.5 }}>
            Discover Lite
          </span>
        </div>
      </div>

      {(screen === "workspace" || screen === "manifest") && (
        <div className="breadcrumb">
          <span className="sep">/</span>
          <span onClick={onWorkspace} style={onWorkspace ? { cursor: "pointer" } : undefined} className="crumb-link">Workspace</span>
          <span className="sep">/</span>
          <span onClick={onWorkspace} style={onWorkspace ? { cursor: "pointer" } : undefined} className="crumb-link">{workspaceName}</span>
          {screen === "manifest" && (
            <>
              <span className="sep">/</span>
              <span className="crumb-active">Agent · {agentName}</span>
            </>
          )}
        </div>
      )}

      <div className="spacer" />

      <div className="kbd-hint" title="Keyboard shortcuts">
        <Icon name="search" size={11} /> Search
        <span className="k">⌘K</span>
      </div>
      <div className="env">
        <span className="env-dot" />
        demo • local-only
      </div>

      <div className="popover-anchor">
        <button
          className="icon-btn"
          title="Settings"
          aria-label="Settings"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((v) => !v)}
          style={settingsOpen ? { borderColor: "var(--border-cyan)", color: "var(--cyan)" } : undefined}
        >
          <Icon name={resolvedTheme === "light" ? "sun" : "moon"} size={13} />
        </button>
        {settingsOpen && (
          <SettingsPopover
            themePref={themePref}
            setThemePref={setThemePref}
            resolvedTheme={resolvedTheme}
            onClose={() => setSettingsOpen(false)}
            onSignOut={onSignOut}
          />
        )}
      </div>

      <div className="user">{userInitials || "DC"}</div>
    </header>
  );
}

function SettingsPopover({
  themePref,
  setThemePref,
  resolvedTheme,
  onClose,
  onSignOut,
}: {
  themePref: ThemePref;
  setThemePref: (p: ThemePref) => void;
  resolvedTheme: "light" | "dark";
  onClose: () => void;
  onSignOut?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="popover" ref={ref} role="dialog" aria-label="Settings">
      <div className="popover-head">Settings</div>
      <div className="popover-section">
        <div className="lbl">Appearance</div>
        <div className="theme-seg">
          <button data-active={themePref === "light"} onClick={() => setThemePref("light")} title="Light theme">
            <Icon name="sun" size={12} /> Light
          </button>
          <button data-active={themePref === "dark"} onClick={() => setThemePref("dark")} title="Dark theme">
            <Icon name="moon" size={12} /> Dark
          </button>
          <button data-active={themePref === "system"} onClick={() => setThemePref("system")} title="Match system">
            <Icon name="monitor" size={12} /> System
          </button>
        </div>
        {themePref === "system" && (
          <div style={{ fontSize: 10.5, color: "var(--text-4)", marginTop: 6, fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>
            Auto · currently {resolvedTheme}
          </div>
        )}
      </div>
      <div className="popover-section">
        <div className="lbl">Workspace</div>
        <div className="popover-row">
          <span>Compact density</span>
          <span className="tgl" data-on="false" />
        </div>
        <div className="popover-row">
          <span>Show keyboard hints</span>
          <span className="tgl" data-on="true" />
        </div>
        <div className="popover-row">
          <span>Show minimap</span>
          <span className="tgl" data-on="true" />
        </div>
      </div>
      {onSignOut && (
        <div className="popover-section">
          <button className="btn btn-sm btn-ghost" style={{ width: "100%", justifyContent: "center" }} onClick={() => { onClose(); onSignOut(); }}>
            <Icon name="external" size={12} /> Sign out
          </button>
        </div>
      )}
      <div className="popover-foot">Pedigree Discover Lite · v0.1.0</div>
    </div>
  );
}
