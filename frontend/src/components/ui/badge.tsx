import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { inlineIcon } from "@/lib/focus";

/**
 * figma: Badge — State = Default | Secondary | Destructive | Outline | Ghost.
 * `Ghost` is an addition over upstream shadcn. Geometry: h 22, px 8, py 2,
 * gap 4, rounded-4xl (26 — a pill at this height).
 *
 * The destructive badge is *subtle*: `destructive-subtle` behind
 * `text-destructive`, not a solid red chip.
 *
 * Icons and spinners inside a badge take data-icon="inline-start" |
 * "inline-end". Custom colours are applied with utility classes, e.g.
 * `className="bg-green-50 dark:bg-green-800"`.
 */
const badgeVariants = cva(
  cn(
    "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden",
    "rounded-4xl px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors",
    "[&>svg]:pointer-events-none [&>svg]:size-3",
    inlineIcon,
    "focus-visible:border-ring focus-visible:ring-ring-subtle focus-visible:ring-[3px]"
  ),
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "bg-destructive-subtle text-text-destructive [a&]:hover:bg-destructive-subtle/80",
        outline: "border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        ghost: "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";
  return <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
