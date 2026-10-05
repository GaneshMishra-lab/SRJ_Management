"use client";

import { useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Segmented } from "@/components/controls";
import type { Theme } from "@/lib/theme";

// Light, dark, or whatever the device is set to. The choice lives in a cookie, which the root
// layout reads to put data-theme on <html>, so pages open in the right theme without a flash.
export function ThemeSwitch({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);

  const choose = (next: Theme) => {
    setTheme(next);
    document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
    if (next === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = next;
  };

  return (
    <Segmented
      label="Appearance"
      className="h-8! w-full"
      value={theme}
      onChange={choose}
      options={[
        { value: "light", label: <Sun className="h-4 w-4" />, title: "Light" },
        { value: "dark", label: <Moon className="h-4 w-4" />, title: "Dark" },
        { value: "auto", label: <Monitor className="h-4 w-4" />, title: "Match this device" },
      ]}
    />
  );
}
