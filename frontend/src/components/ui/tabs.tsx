import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * figma: Tab — 32 variants
 *   Variant   Default (pill on a muted rail) | Underline
 *   Selected  On | Off
 *   State     Default | Hover | Focus | Disabled
 *   Dir       LTR | RTL
 *
 * `Underline` is an addition over upstream shadcn: the rail loses its
 * background, the trigger loses its surface, and the active tab gets a 2px
 * bottom rule in `foreground`.
 */
const TabsVariantContext = React.createContext<"default" | "line">("default");

function Tabs({
  className,
  variant = "default",
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root> & { variant?: "default" | "line" }) {
  return (
    <TabsVariantContext.Provider value={variant}>
      <TabsPrimitive.Root
        data-slot="tabs"
        data-variant={variant}
        orientation={orientation}
        className={cn(
          "flex gap-2",
          orientation === "vertical" ? "flex-row" : "flex-col",
          className
        )}
        {...props}
      />
    </TabsVariantContext.Provider>
  );
}

const tabsListVariants = cva("inline-flex w-fit items-center justify-center", {
  variants: {
    variant: {
      default: cn(
        "rounded-lg bg-muted p-0.5 text-muted-foreground",
        "data-[orientation=vertical]:h-auto data-[orientation=vertical]:flex-col"
      ),
      line: cn(
        "gap-1 text-muted-foreground",
        "data-[orientation=horizontal]:h-9 data-[orientation=horizontal]:border-b",
        "data-[orientation=vertical]:h-auto data-[orientation=vertical]:flex-col data-[orientation=vertical]:border-e"
      ),
    },
  },
  defaultVariants: { variant: "default" },
});

function TabsList({
  className,
  variant,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & VariantProps<typeof tabsListVariants>) {
  const contextVariant = React.useContext(TabsVariantContext);
  const resolved = variant ?? contextVariant;
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={resolved}
      className={cn("group/tabs-list", tabsListVariants({ variant: resolved }), className)}
      {...props}
    />
  );
}

const tabsTriggerVariants = cva(
  cn(
    "inline-flex flex-1 items-center justify-center gap-1.5 px-2.5 py-1 text-sm font-medium",
    "whitespace-nowrap transition-[color,box-shadow] outline-none",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    "focus-visible:border-ring focus-visible:ring-ring-subtle focus-visible:ring-[3px]",
    "disabled:pointer-events-none disabled:opacity-50",
    "hover:text-foreground"
  ),
  {
    variants: {
      variant: {
        default: cn(
          "rounded-md border border-transparent",
          "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs"
        ),
        line: cn(
          "relative rounded-none border-transparent",
          "group-data-[orientation=horizontal]/tabs-list:-mb-px group-data-[orientation=horizontal]/tabs-list:border-b-2",
          "group-data-[orientation=vertical]/tabs-list:-me-px group-data-[orientation=vertical]/tabs-list:border-e-2",
          "data-[state=active]:border-foreground data-[state=active]:text-foreground"
        ),
      },
    },
    defaultVariants: { variant: "default" },
  }
);

function TabsTrigger({
  className,
  variant,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger> &
  VariantProps<typeof tabsTriggerVariants>) {
  const contextVariant = React.useContext(TabsVariantContext);
  const resolved = variant ?? contextVariant;
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      data-variant={resolved}
      className={cn(tabsTriggerVariants({ variant: resolved }), className)}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants, tabsTriggerVariants };
