import { APP_ENV, isProduction } from "@/lib/env";
import { cn } from "@/lib/utils";

/**
 * Small fixed pill in the bottom-right corner indicating the current
 * deployment environment. Renders nothing in production.
 *
 *  - develop → yellow "DEV"
 *  - preview → muted "PREVIEW"
 */
export function EnvBadge() {
  if (isProduction()) return null;

  const label = APP_ENV === "develop" ? "DEV" : "PREVIEW";

  const palette =
    APP_ENV === "develop"
      ? "bg-yellow-400 text-black border-yellow-500"
      : "bg-muted text-muted-foreground border-border";

  return (
    <div
      role="status"
      aria-label={`Environment: ${label}`}
      className={cn(
        "fixed bottom-3 right-3 z-50 select-none",
        "rounded-full border px-2.5 py-0.5 text-[10px] font-bold tracking-wider",
        "shadow-md backdrop-blur-sm",
        palette,
      )}
    >
      {label}
    </div>
  );
}

export default EnvBadge;
