export const THEME_STORAGE_KEY = "posokanei-theme";
export const SUPPORTED_THEMES = ["system", "light", "dark"];

export function getInitialTheme() {
  try {
    const stored = globalThis.localStorage?.getItem(THEME_STORAGE_KEY);
    return SUPPORTED_THEMES.includes(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

export function saveTheme(theme) {
  try {
    globalThis.localStorage?.setItem(
      THEME_STORAGE_KEY,
      SUPPORTED_THEMES.includes(theme) ? theme : "system",
    );
  } catch {
    // Theme switching still works when strict browser storage rejects writes.
  }
}

export function resolveTheme(theme, prefersDark = false) {
  if (theme === "dark") return "dark";
  if (theme === "light") return "light";
  return prefersDark ? "dark" : "light";
}

export function applyTheme(theme, prefersDark = false) {
  const resolved = resolveTheme(theme, prefersDark);
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themePreference = theme;
    document.documentElement.style.colorScheme = resolved;
  }
  return resolved;
}
