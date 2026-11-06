import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * figma: Input — 32 variants
 *   State     Default | Focus/Active | Destructive | Disabled
 *   Text      Placeholder | Active        (content, not an API)
 *   Dir       LTR | RTL                   (handled by `dir` on an ancestor)
 *   Roudness  Default | Rounded
 *
 * Geometry: h 32, px 10, py 4, radius-lg, 1px border.
 * Disabled fill is `input/50` (#e5e5e580) rather than plain opacity.
 *
 * The Figma `Roudness` axis is applied with `className="rounded-full"`, the
 * same way the Button docs describe it.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
    "flex h-8 w-full min-w-0 bg-background px-2.5 py-1 text-sm shadow-xs transition-[color,box-shadow]",
    "border border-input outline-none",
    "placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground",
    "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
    "focus-visible:border-ring focus-visible:ring-ring-subtle focus-visible:ring-[3px]",
    "aria-invalid:border-destructive aria-invalid:ring-ring-destructive aria-invalid:ring-[3px]",
        "rounded-lg",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50",
        className
      )}
      {...props}
    />
  );
}

export { Input };
