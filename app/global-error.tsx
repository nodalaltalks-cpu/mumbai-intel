"use client";

import { useEffect } from "react";

/** Only fires if the root layout itself throws — must render its own <html>/<body> since it replaces everything, including the layout that normally provides them. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app] root layout error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ background: "#fafafa", color: "#18181b", fontFamily: "sans-serif" }}>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, textAlign: "center", padding: 16 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>NoDalalTalks is temporarily unavailable</h1>
          <p style={{ maxWidth: 360, fontSize: 14, color: "#71717a" }}>Something went wrong loading the application. Please try again.</p>
          <button
            type="button"
            onClick={reset}
            style={{ background: "#4f46e5", color: "#fff", padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600, textTransform: "uppercase", border: "none", cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
