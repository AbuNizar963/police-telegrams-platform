import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";
export type ThemePreference = Theme | "system";

interface ThemeContextType {
  theme: Theme;
  preference: ThemePreference;
  setThemePreference: (preference: ThemePreference) => void;
  toggleTheme?: () => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: ThemePreference;
  switchable?: boolean;
}

function readThemePreference(fallback: ThemePreference): ThemePreference {
  try {
    const stored = window.localStorage.getItem("theme");
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    // Continue with the configured default when browser storage is unavailable.
  }

  return fallback;
}

function resolveTheme(preference: ThemePreference, systemIsDark: boolean): Theme {
  if (preference === "system") {
    return systemIsDark ? "dark" : "light";
  }

  return preference;
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  switchable = false,
}: ThemeProviderProps) {
  const [preference, setPreference] = useState<ThemePreference>(() =>
    switchable ? readThemePreference(defaultTheme) : defaultTheme
  );
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") {
      return "light";
    }

    return resolveTheme(
      preference,
      window.matchMedia("(prefers-color-scheme: dark)").matches
    );
  });

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const applyTheme = () => {
      const resolved = resolveTheme(preference, media.matches);
      setTheme(resolved);
      root.classList.toggle("dark", resolved === "dark");
      root.style.colorScheme = resolved;
    };

    applyTheme();
    if (preference === "system") {
      media.addEventListener("change", applyTheme);
    }

    if (switchable) {
      try {
        window.localStorage.setItem("theme", preference);
      } catch {
        // The current session still works when storage is unavailable.
      }
    }

    return () => media.removeEventListener("change", applyTheme);
  }, [preference, switchable]);

  const setThemePreference = (next: ThemePreference) => {
    if (switchable) {
      setPreference(next);
    }
  };

  const toggleTheme = switchable
    ? () => {
        const media = window.matchMedia("(prefers-color-scheme: dark)");
        const resolved = resolveTheme(preference, media.matches);
        setPreference(resolved === "dark" ? "light" : "dark");
      }
    : undefined;

  return (
    <ThemeContext.Provider
      value={{
        theme,
        preference,
        setThemePreference,
        toggleTheme,
        switchable,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return context;
}
