import type * as React from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * Sonner reads the shadcn tokens directly, so toasts follow the OS appearance
 * with the rest of the window.
 */
function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      className="toaster group"
      position="bottom-center"
      offset={16}
      toastOptions={{
        classNames: {
          toast:
            "!bg-popover !text-popover-foreground !border-border !rounded-lg !shadow-lg !text-xs !gap-2",
          description: "!text-muted-foreground",
          actionButton: "!bg-primary !text-primary-foreground",
          cancelButton: "!bg-muted !text-muted-foreground",
          error:
            "!bg-destructive-muted !text-destructive !border-destructive/30",
          success: "!bg-success-muted !text-success !border-success/30",
        },
      }}
      style={{ "--width": "24rem" } as React.CSSProperties}
      {...props}
    />
  );
}

export { Toaster };
