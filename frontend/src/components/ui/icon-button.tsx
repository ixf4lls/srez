import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { controlIcon, disabled, focusRing } from "@/lib/focus";

/**
 * figma: Icon Button — 160 variants. Same axes as Button minus `Link`, square
 * at every size (24 / 28 / 32 / 36). A separate component set in Figma, so a
 * separate component here — not `size="icon"` on Button.
 *
 * Use `className="rounded-full"` for the pill treatment.
 * Always give it an accessible name.
 */
const iconButtonVariants = cva(
  cn(
    "inline-flex shrink-0 items-center justify-center transition-all",
    controlIcon,
    focusRing,
    disabled
  ),
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        destructive:
          "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-ring-destructive",
        outline: "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        xs: "size-6 rounded-sm [&_svg:not([class*='size-'])]:size-3",
        sm: "size-7 rounded-sm [&_svg:not([class*='size-'])]:size-3.5",
        default: "size-8 rounded-lg",
        lg: "size-9 rounded-lg",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface IconButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof iconButtonVariants> {
  asChild?: boolean;
}

function IconButton({ className, variant, size, asChild = false, ...props }: IconButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="icon-button"
      data-motion="icon-button"
      className={cn(iconButtonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { IconButton, iconButtonVariants };
