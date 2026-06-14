"""Create (or update) an admin user.

Usage (from backend/, with venv active and env vars set):
    python -m scripts.seed --username admin --password 'changeme' [--display-name Kevin]

Idempotent: if the username exists, its password/role are updated to match.
"""

import argparse
import sys

from app.db.database import get_db_connection
from app.routes._helpers import now_iso
from app.utils.security import hash_password


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed an admin user")
    parser.add_argument("--username", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--display-name", default=None)
    parser.add_argument("--role", default="admin", choices=["admin", "user"])
    args = parser.parse_args()

    ts = now_iso()
    pw_hash = hash_password(args.password)
    with get_db_connection() as conn:
        existing = conn.execute(
            "SELECT id FROM users WHERE username = ?", (args.username,)
        ).fetchone()
        if existing:
            conn.execute(
                "UPDATE users SET password_hash=?, role=?, display_name=?, is_active=1, updated_at=? WHERE id=?",
                (pw_hash, args.role, args.display_name, ts, existing["id"]),
            )
            conn.commit()
            print(f"Updated existing user '{args.username}' (id={existing['id']}, role={args.role}).")
        else:
            cur = conn.execute(
                """
                INSERT INTO users (username, display_name, password_hash, role, is_active, created_at, updated_at)
                VALUES (?, ?, ?, ?, 1, ?, ?)
                """,
                (args.username, args.display_name, pw_hash, args.role, ts, ts),
            )
            conn.commit()
            print(f"Created user '{args.username}' (id={cur.lastrowid}, role={args.role}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
