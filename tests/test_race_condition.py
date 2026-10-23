"""Proves the booking system is race-safe -- not by reading the code, but
by actually trying to break it: two real HTTP requests for the exact same
time slot, fired at the same instant, against a real running server.

No mocks, no dependencies beyond the Python standard library. The claim
being tested is simple: of the two requests, exactly one succeeds (200)
and exactly one is refused (409) -- never both succeeding (a double
booking) and never both failing (a bug that blocks everyone).

Usage:
    1. Run the API locally (e.g. `npm run dev`), pointed at a real
       Postgres database with the migration in sql/migration.sql applied.
    2. python tests/test_race_condition.py
"""

import json
import threading
import time
import urllib.error
import urllib.request

BASE_URL = "http://localhost:3000"
SAME_SLOT = "2027-01-15T14:00:00.000Z"  # both requests target this exact instant


def post_booking(email: str, results: list, index: int) -> None:
    body = json.dumps({
        "fullName": f"Race Test {index}",
        "email": email,
        "scheduledAt": SAME_SLOT,
    }).encode()
    req = urllib.request.Request(
        f"{BASE_URL}/api/book-slot",
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            results[index] = resp.status
    except urllib.error.HTTPError as e:
        results[index] = e.code


def main() -> None:
    results = [None, None]
    threads = [
        threading.Thread(target=post_booking, args=("racer-a@example.invalid", results, 0)),
        threading.Thread(target=post_booking, args=("racer-b@example.invalid", results, 1)),
    ]

    # Starting both threads back to back (no sleep between them) is what
    # makes this a genuine race: both requests reach the server within
    # microseconds of each other, the same way two real visitors clicking
    # "Confirm" at the same moment would.
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    statuses = sorted(results)
    print("Request statuses:", results)

    assert statuses == [200, 409], (
        f"Expected exactly one 200 and one 409, got {results}. "
        "Either the database constraint is missing (both could succeed -- "
        "a real double booking), or something else is wrong."
    )
    print("PASS: exactly one request won the slot, the other was correctly refused.")


if __name__ == "__main__":
    main()
