import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "border-input bg-background/60 placeholder:text-muted-foreground/70 flex h-9 w-full min-w-0 rounded-md border px-3 py-1 text-sm shadow-xs transition-[color,box-shadow,border-color] outline-none",
        "focus-visible:border-ring focus-visible:ring-ring/40 focus-visible:ring-[3px]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "[&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
