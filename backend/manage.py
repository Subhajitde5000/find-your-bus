"""Command-line helper for the database.

    python manage.py init-db                       # create tables
    python manage.py import-data                   # load both Excel files (empty DB only)
    python manage.py import-data --replace         # wipe reference + fleet data and reload

The database is chosen with the DATABASE_URL setting (backend/.env or environment variable).
"""

from __future__ import annotations

import argparse
import sys

from app.config import DEFAULT_DATA_DIR
from app.db import Base, SessionLocal, engine
from app import models  # noqa: F401  (registers all tables on Base.metadata)


def cmd_init_db(_: argparse.Namespace) -> int:
    Base.metadata.create_all(engine)
    print("Tables created (existing tables were left untouched).")
    return 0


def cmd_import_data(args: argparse.Namespace) -> int:
    from app.importer import import_all

    Base.metadata.create_all(engine)
    with SessionLocal() as session:
        try:
            report = import_all(
                session,
                stands_path=args.stands,
                routes_path=args.routes,
                replace=args.replace,
            )
        except RuntimeError as exc:
            print(f"Error: {exc}", file=sys.stderr)
            return 1
    print(report.summary())
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Find Your Bus database tools")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("init-db", help="Create database tables").set_defaults(func=cmd_init_db)

    imp = sub.add_parser("import-data", help="Import the Excel workbooks in /data")
    imp.add_argument("--stands", type=str,
                     default=str(DEFAULT_DATA_DIR / "Kolkata_Bus_Stands_v2.xlsx"))
    imp.add_argument("--routes", type=str,
                     default=str(DEFAULT_DATA_DIR / "Kolkata_Comprehensive_Bus_Routes_and_Fleet_Directory.xlsx"))
    imp.add_argument("--replace", action="store_true",
                     help="Delete existing data in these tables before importing")
    imp.set_defaults(func=cmd_import_data)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
