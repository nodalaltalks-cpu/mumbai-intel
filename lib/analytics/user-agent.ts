/**
 * Minimal, dependency-free User-Agent parsing — good enough for analytics
 * breakdowns (device/browser/OS mix), not meant to be exhaustive. Pure
 * string logic, no server-only requirement, so it's usable from anywhere.
 */
export interface ParsedUserAgent {
  device: string;
  browser: string;
  os: string;
}

export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  if (!ua) return { device: "Unknown", browser: "Unknown", os: "Unknown" };

  const device = /iPad|Tablet(?!.*Mobile)/i.test(ua) ? "Tablet" : /Mobi|Android|iPhone/i.test(ua) ? "Mobile" : "Desktop";

  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua) && !/Chromium/.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua) && !/Chrome/.test(ua)
            ? "Safari"
            : "Other";

  const os = /Windows/.test(ua)
    ? "Windows"
    : /Mac OS X/.test(ua)
      ? "macOS"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad|iPod|iOS/.test(ua)
          ? "iOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "Other";

  return { device, browser, os };
}
