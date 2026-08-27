"use client";

import { useState, useTransition } from "react";
import { acceptCookiesAction, declineCookiesAction } from "@/lib/actions/cookie-consent";

/**
 * Inline restyle of the same two consent actions the cookie banner uses
 * (app/components/CookieConsentBanner.tsx) -- there is still only one
 * consent cookie and one set of server actions; this just gives Settings a
 * non-modal way to change that choice later, since the banner itself only
 * ever shows once, before a decision exists. No sourceInfo is passed here
 * (unlike the first-touch banner) -- re-consenting later isn't a new visit
 * worth attributing to a channel.
 */
export default function SettingsCookiePreferences() {
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function accept() {
    startTransition(async () => {
      await acceptCookiesAction();
      setStatus("Analytics cookies enabled.");
    });
  }

  function decline() {
    startTransition(async () => {
      await declineCookiesAction();
      setStatus("Analytics cookies turned off.");
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={accept}
          disabled={isPending}
          className="rounded-sm border border-border px-3 py-1.5 text-xs text-foreground hover:border-accent hover:text-accent disabled:opacity-60"
        >
          Accept analytics
        </button>
        <button
          type="button"
          onClick={decline}
          disabled={isPending}
          className="rounded-sm border border-border px-3 py-1.5 text-xs text-foreground hover:bg-surface-raised disabled:opacity-60"
        >
          Turn off analytics
        </button>
      </div>
      {status ? <p className="text-[11px] text-muted">{status}</p> : null}
    </div>
  );
}
