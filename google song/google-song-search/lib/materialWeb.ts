"use client";

import { useEffect, useState } from "react";

/**
 * Lazily registers Material Web custom elements on the client only.
 * Avoids Lit/window access during Next.js SSR.
 */
export function useMaterialWebReady() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([
      import("@material/web/textfield/filled-text-field.js"),
      import("@material/web/select/filled-select.js"),
      import("@material/web/select/select-option.js"),
    ]).then(() => {
      if (!cancelled) setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return ready;
}
