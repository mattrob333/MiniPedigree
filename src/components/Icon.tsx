import type { CSSProperties } from "react";

interface IconProps {
  name: string;
  size?: number;
  stroke?: string;
  strokeWidth?: number;
  style?: CSSProperties;
  className?: string;
}

export function Icon({ name, size = 14, stroke = "currentColor", strokeWidth = 1.6, style = {}, className = "" }: IconProps) {
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke,
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "ico " + className,
    style,
  };
  switch (name) {
    case "search":
      return <svg {...props}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>;
    case "close":
      return <svg {...props}><path d="M6 6l12 12M18 6l-12 12" /></svg>;
    case "plus":
      return <svg {...props}><path d="M12 5v14M5 12h14" /></svg>;
    case "minus":
      return <svg {...props}><path d="M5 12h14" /></svg>;
    case "chevron-down":
      return <svg {...props}><path d="M6 9l6 6 6-6" /></svg>;
    case "chevron-right":
      return <svg {...props}><path d="M9 6l6 6-6 6" /></svg>;
    case "chevron-left":
      return <svg {...props}><path d="M15 6l-6 6 6 6" /></svg>;
    case "arrow-right":
      return <svg {...props}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
    case "upload":
      return <svg {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" /></svg>;
    case "play":
      return <svg {...props}><path d="M7 4v16l13-8z" fill={stroke} stroke="none" /></svg>;
    case "spreadsheet":
      return <svg {...props}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></svg>;
    case "network":
      return <svg {...props}><circle cx="12" cy="5" r="2.2" /><circle cx="5" cy="19" r="2.2" /><circle cx="12" cy="19" r="2.2" /><circle cx="19" cy="19" r="2.2" /><path d="M12 7.2v3.8M12 11l-7 6M12 11l7 6M12 11v6" /></svg>;
    case "users":
      return <svg {...props}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
    case "user":
      return <svg {...props}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
    case "robot":
      return <svg {...props}><rect x="3" y="8" width="18" height="12" rx="3" /><circle cx="9" cy="14" r="1.2" /><circle cx="15" cy="14" r="1.2" /><path d="M12 4v4M8 4h8" /></svg>;
    case "sparkles":
      return <svg {...props}><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" /><path d="M19 14l.6 1.6L21 16l-1.4.4L19 18l-.6-1.6L17 16l1.4-.4z" /></svg>;
    case "checkmark":
      return <svg {...props}><path d="M5 12l5 5L20 7" /></svg>;
    case "check-circle":
      return <svg {...props}><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></svg>;
    case "warning":
      return <svg {...props}><path d="M10.3 3.86L2 18a2 2 0 0 0 1.7 3h16.6A2 2 0 0 0 22 18L13.7 3.86a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></svg>;
    case "lock":
      return <svg {...props}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
    case "shield":
      return <svg {...props}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>;
    case "fit":
      return <svg {...props}><path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" /></svg>;
    case "target":
      return <svg {...props}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" fill={stroke} /></svg>;
    case "menu-dots":
      return <svg {...props}><circle cx="5" cy="12" r="1.4" fill={stroke} /><circle cx="12" cy="12" r="1.4" fill={stroke} /><circle cx="19" cy="12" r="1.4" fill={stroke} /></svg>;
    case "doc":
      return <svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h8M8 9h2" /></svg>;
    case "csv":
      return <svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 13v5M13 13v5M9 16h4" /></svg>;
    case "transcript":
      return <svg {...props}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9h10M7 13h10M7 17h6" /></svg>;
    case "code":
      return <svg {...props}><path d="M8 6l-6 6 6 6M16 6l6 6-6 6" /></svg>;
    case "copy":
      return <svg {...props}><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V4a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></svg>;
    case "download":
      return <svg {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>;
    case "info":
      return <svg {...props}><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></svg>;
    case "filter":
      return <svg {...props}><path d="M3 4h18l-7 9v6l-4 2v-8z" /></svg>;
    case "sort":
      return <svg {...props}><path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" /></svg>;
    case "branch":
      return <svg {...props}><circle cx="6" cy="6" r="2.2" /><circle cx="6" cy="18" r="2.2" /><circle cx="18" cy="8" r="2.2" /><path d="M6 8v8M18 10c0 4-4 6-12 6" /></svg>;
    case "external":
      return <svg {...props}><path d="M15 3h6v6M21 3l-9 9M14 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9" /></svg>;
    case "mic":
      return <svg {...props}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;
    case "stop":
      return <svg {...props}><rect x="6" y="6" width="12" height="12" rx="2" fill={stroke} stroke="none" /></svg>;
    case "history":
      return <svg {...props}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
    case "build":
      return <svg {...props}><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-3 3-2-2 3-3z" /></svg>;
    case "sun":
      return <svg {...props}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></svg>;
    case "moon":
      return <svg {...props}><path d="M21 12.8A8 8 0 0 1 11.2 3a8 8 0 1 0 9.8 9.8z" /></svg>;
    case "monitor":
      return <svg {...props}><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>;
    default:
      return <svg {...props}><circle cx="12" cy="12" r="9" /></svg>;
  }
}
