import { Badge } from "@/components/ui/badge";
import { statusBadgeClasses } from "@/lib/status";
import type { StatusCode } from "@/lib/types";
import { cn } from "@/lib/utils";

export function StatusBadge({
  code,
  label,
  className,
}: {
  code: StatusCode;
  label: string;
  className?: string;
}) {
  return (
    <Badge className={cn(statusBadgeClasses(code), className)}>{label}</Badge>
  );
}
