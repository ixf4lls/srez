import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * figma: Card page — "Card header" (Type = Button | Badge | Image, Dir),
 * "Card content", "Card footer". Surface is `card` with a 1px border,
 * radius-xl (14) and shadow-xs; header/footer pad 24px, content 24px.
 */
/** figma: Card. `size="sm"` uses smaller spacing throughout. */
const cardVariants = cva(
  "flex flex-col rounded-xl border bg-card text-card-foreground shadow-xs",
  {
    variants: {
      size: {
        default: "gap-6 py-6 [&_[data-slot=card-header]]:px-6 [&_[data-slot=card-content]]:px-6 [&_[data-slot=card-footer]]:px-6",
        sm: "gap-4 py-4 [&_[data-slot=card-header]]:px-4 [&_[data-slot=card-content]]:px-4 [&_[data-slot=card-footer]]:px-4",
      },
    },
    defaultVariants: { size: "default" },
  }
);

function Card({
  className,
  size,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  return (
    <div
      data-slot="card"
      data-size={size ?? "default"}
      className={cn(cardVariants({ size }), className)}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min items-start gap-1.5 px-6",
        "has-data-[slot=card-action]:grid-cols-[1fr_auto]",
        "[.border-b]:pb-6",
        className
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

/** figma: "Card header / Type=Button | Badge" — the trailing action slot. */
function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("px-6", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
      {...props}
    />
  );
}

export { Card, cardVariants, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter };
