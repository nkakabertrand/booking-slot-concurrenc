// POST /api/book-slot
//
// The race-safety here does NOT come from this code -- it comes from the
// partial unique index in sql/migration.sql. This handler's job is just to
// translate the database's refusal (error code 23505, "unique_violation")
// into a clear, specific HTTP response, instead of a generic 500.
//
// This is a trimmed, generalized version of a handler from a production
// booking feature -- validation details, email notifications, and CRM
// integration have been removed to keep the concurrency pattern readable
// on its own.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type BookSlotRequest = {
  fullName: string;
  email: string;
  scheduledAt: string; // ISO timestamp, already validated/combined client-side
};

function isValid(body: unknown): body is BookSlotRequest {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.fullName === "string" &&
    b.fullName.trim().length > 0 &&
    typeof b.email === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email) &&
    typeof b.scheduledAt === "string" &&
    !Number.isNaN(new Date(b.scheduledAt).getTime())
  );
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!isValid(body)) {
    return NextResponse.json({ ok: false, message: "Invalid request." }, { status: 400 });
  }

  // Server-side client with write access -- the browser never talks to the
  // database directly for a write like this.
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { error } = await supabase.from("appointments").insert({
    full_name: body.fullName,
    email: body.email,
    scheduled_at: body.scheduledAt,
  });

  if (error) {
    // The one line that makes this whole pattern work: a 23505 here means
    // the unique index just did its job -- someone else took this exact
    // slot between this visitor loading the page and clicking submit.
    if (error.code === "23505") {
      return NextResponse.json(
        { ok: false, message: "That time was just booked by someone else. Please choose another time." },
        { status: 409 },
      );
    }
    console.error("[book-slot] insert failed:", error.code);
    return NextResponse.json({ ok: false, message: "We could not save your booking just now." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
