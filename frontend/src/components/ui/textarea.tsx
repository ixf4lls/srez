import * as React from "react";

import { cn } from "@/lib/utils";

/** figma: Textarea — State = Default | Focus | Destructive | Disabled, Dir = LTR | RTL. */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-background",
        "px-2.5 py-1.5 text-sm shadow-xs transition-[color,box-shadow] outline-none",
        "placeholder:text-muted-foreground",
        "focus-visible:border-ring focus-visible:ring-ring-subtle focus-visible:ring-[3px]",
        "aria-invalid:border-destructive aria-invalid:ring-ring-destructive aria-invalid:ring-[3px]",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
