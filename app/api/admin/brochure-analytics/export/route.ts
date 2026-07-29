import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/guard";
import { getBrochureEventsForExport } from "@/lib/analytics/brochure-queries";

function csvEscape(value: string | number | boolean | null): string {
  if (value === null) return "";
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const COLUMNS = ["createdAt", "eventType", "projectName", "builderName", "localityName", "device", "browser", "os", "country", "city", "isRepeat", "isLoggedIn"] as const;

export async function GET() {
  await requireSession();

  const events = await getBrochureEventsForExport(5000);
  const header = COLUMNS.join(",");
  const rows = events.map((e) =>
    COLUMNS.map((col) => {
      const value = col === "createdAt" ? e.createdAt.toISOString() : e[col];
      return csvEscape(value as string | number | boolean | null);
    }).join(",")
  );
  const csv = [header, ...rows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="brochure-analytics-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
