/**
 * shadcn themes off a `.dark` class, but a desktop app should follow the OS.
 * Mirror the media query onto the root element and keep it in sync.
 */
export function syncSystemTheme() {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  const apply = (dark: boolean) =>
    document.documentElement.classList.toggle("dark", dark);

  apply(query.matches);
  query.addEventListener("change", (event) => apply(event.matches));
}
