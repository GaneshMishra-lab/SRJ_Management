"use client";

import { useEffect } from "react";

// Browsers change a focused number field when the mouse wheel turns over it, which silently
// alters amounts and weights. Dropping focus first makes the wheel scroll the page instead.
export function NumberWheelGuard() {
  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.type === "number" && target === document.activeElement) {
        target.blur();
      }
    };
    document.addEventListener("wheel", onWheel, { capture: true, passive: true });
    return () => document.removeEventListener("wheel", onWheel, { capture: true });
  }, []);

  return null;
}
