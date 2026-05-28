import type { Status } from "@/types";
import { STATUS_LABEL } from "@/lib/util";

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={"badge " + status}>
      <span className="dot" />
      {STATUS_LABEL[status]}
    </span>
  );
}
