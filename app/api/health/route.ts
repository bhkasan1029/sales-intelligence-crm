import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

/**
 * GET /api/health — the probe behind the header's "Live Engine" chip. Returns
 * how long the database round-trip took so the chip reports real latency
 * rather than a decoration.
 */
export async function GET() {
  const started = Date.now();
  try {
    await sql`SELECT 1`;
    return NextResponse.json(
      { ok: true, db_ms: Date.now() - started, at: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { ok: false, db_ms: Date.now() - started, at: new Date().toISOString() },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
