"use client";

import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { SITE_THEME_COOKIE, type SiteTheme } from "@/lib/theme";
import { iconButtonClass } from "@/lib/styles";

// Light or dark for the customer-facing pages. The page's wrapper carries data-theme="…" from the
// cookie, so it opens in the right theme; this flips the attribute at once and saves the choice.
export function SiteThemeToggle({ initial }: { initial: SiteTheme }) {
  const [theme, setTheme] = useState<SiteTheme>(initial);
  const next: SiteTheme = theme === "dark" ? "light" : "dark";

  const toggle = () => {
    setTheme(next);
    document.cookie = `${SITE_THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    document.querySelector("[data-site]")?.setAttribute("data-theme", next);
  };

  return (
    <button type="button" onClick={toggle} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`} className={iconButtonClass}>
      {theme === "dark" ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </button>
  );
}
