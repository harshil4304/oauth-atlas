"use client";

import { useMemo, useSyncExternalStore } from "react";
import { GuideView } from "@/components/GuideView";
import { decodeGuide } from "@/lib/export";

const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};

/** Renders a guide packed entirely into the URL fragment (#g=...). The fragment never reaches the server. */
export default function SharePage() {
  const hash = useSyncExternalStore(
    subscribe,
    () => location.hash,
    () => null,
  );
  const guide = useMemo(() => {
    if (hash === null) return undefined;
    const m = hash.match(/g=([^&]+)/);
    return m ? decodeGuide(m[1]) : null;
  }, [hash]);

  if (guide === undefined) return <p className="pt-16 text-ink-3">Opening the guide…</p>;
  if (!guide)
    return (
      <div className="pt-16">
        <h1 className="text-3xl font-extrabold">This share link is incomplete</h1>
        <p className="mt-3 max-w-[60ch] text-ink-2">The guide data at the end of the link is missing or was cut off. Ask for the link again, or search for the app.</p>
      </div>
    );
  return <GuideView guide={guide} persisted={false} />;
}
