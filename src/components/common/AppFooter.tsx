import type { Locations } from "@/lib/types";

/** The three files the app manages, always in view so nothing is a mystery. */
export function AppFooter({ locations }: { locations: Locations }) {
  return (
    <footer className="bg-card text-muted-foreground flex h-7 shrink-0 items-center gap-4 border-t px-3 font-mono text-[0.625rem]">
      <span className="truncate">{locations.store}</span>
      <span className="truncate">{locations.sshConfig}</span>
      <span className="truncate">{locations.gitconfig}</span>
    </footer>
  );
}
