import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * figma: Skeleton — Skeleton = Avatar (40x40, radius-full) | Text (h 16,
 * radius-md) | Card (h 125, radius-md). All fill `muted`.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
