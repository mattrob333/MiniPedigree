export interface Toast {
  id: string;
  t1: string;
  t2?: string;
  green?: boolean;
}

export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className={"toast" + (t.green ? " green" : "")}>
          <div className="t1">{t.t1}</div>
          {t.t2 && <div className="t2">{t.t2}</div>}
        </div>
      ))}
    </div>
  );
}
