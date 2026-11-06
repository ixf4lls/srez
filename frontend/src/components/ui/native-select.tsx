import * as React from "react";
import { ChevronDownIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * figma: NativeSelect — State = Default | Focus | Destructive | Disabled,
 * Dir = LTR | RTL. Same box as Input plus a trailing chevron drawn by the
 * wrapper (the native control's own arrow is hidden).
 */
function NativeSelect({
  className,
  children,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <div data-slot="native-select-wrapper" className="relative w-full">
      <select
        data-slot="native-select"
        className={cn(
          "h-8 w-full appearance-none rounded-lg border border-input bg-background",
          "ps-2.5 pe-8 text-sm shadow-xs transition-[color,box-shadow] outline-none",
          "focus-visible:border-ring focus-visible:ring-ring-subtle focus-visible:ring-[3px]",
          "aria-invalid:border-destructive aria-invalid:ring-ring-destructive aria-invalid:ring-[3px]",
          "disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon
        aria-hidden
        className="pointer-events-none absolute end-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

/** Organises options into categories. */
function NativeSelectOptGroup({ className, ...props }: React.ComponentProps<"optgroup">) {
  return <optgroup data-slot="native-select-optgroup" className={cn(className)} {...props} />;
}

export { NativeSelect, NativeSelectOptGroup };
