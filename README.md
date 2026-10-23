# Booking Slot Concurrency

A small, self-contained demo of a real problem every online booking system
eventually hits: **what stops two people from booking the exact same time
slot if they click "Confirm" at the same instant?**

This is extracted and generalized from a production booking feature I built
for a client (a travel-safari booking site's "request a call" scheduler).
Names, pricing, and business-specific logic have been removed — this repo
keeps only the general-purpose pattern.

## The problem

A naive implementation checks availability, then writes the booking:

```
1. Check: is 2:00 PM on Friday free?   -> yes
2. Write: book 2:00 PM on Friday for this person
```

If two people run step 1 at nearly the same time, **both** see "yes," and
both proceed to step 2. Now two people hold the same slot. Client-side
disabling of the button, or even a server-side "check then write" in
application code, does not fully close this window — only the database can
guarantee it, because only the database sees every concurrent request at
once.

## The fix

A **partial unique index** on the slot column, enforced by Postgres itself:

```sql
create unique index appointments_scheduled_at_uq
  on public.appointments (scheduled_at)
  where scheduled_at is not null;
```

Now the *database* is the single source of truth for "is this slot taken,"
not the application. Two near-simultaneous inserts for the same timestamp:
Postgres accepts exactly one and rejects the other with a `23505`
(`unique_violation`) error, atomically, no matter how close together the
requests arrive or how many servers are handling them.

The API route (`api/book-slot.ts`) catches that specific error code and
turns it into a clear `409 Conflict` ("that time was just taken, please
choose another") instead of a generic 500 error — the failure mode a real
visitor actually sees is a helpful message, not a crash.

## Proving it actually works

`tests/test_race_condition.py` doesn't just unit-test the code in
isolation — it fires two real HTTP requests for the *same* slot at the same
time, against a real running server and a real database, and asserts:

- exactly one request gets `200 OK`
- exactly one request gets `409 Conflict`
- the database ends up with exactly one row for that slot, never two

This is the same style of test I used throughout the original project: real
requests, real database checks, no mocks — because a mocked test can prove
the code looks right without proving the *system* is race-safe.

## Stack

- **TypeScript / Next.js-style API route** for the write path
- **PostgreSQL** (via Supabase) for the unique constraint that does the real work
- **Python + threading** for the concurrency test, since it's the simplest
  way to fire two requests at genuinely the same instant and assert on the
  outcome of both

## Files

```
api/book-slot.ts      the POST handler: validate -> insert -> catch 23505 -> 409
sql/migration.sql      the schema + the unique index that makes this safe
tests/test_race_condition.py   fires two concurrent requests, proves only one wins
```
