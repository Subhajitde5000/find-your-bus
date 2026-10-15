"""Command-line helper for the database.

    python manage.py init-db                       # create tables
    python manage.py import-data                   # load both Excel files (empty DB only)
    python manage.py import-data --replace         # wipe reference + fleet data and reload
    python manage.py export-static-data            # write the de-duplicated JSON for the static frontend

The database is chosen with the DATABASE_URL setting (backend/.env or environment variable).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

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


def cmd_export_static_data(args: argparse.Namespace) -> int:
    from app.static_export import build_dataset, write_dataset

    dataset, report = build_dataset()
    write_dataset(Path(args.output), dataset)
    counts = dataset["meta"]["counts"]
    for key, value in counts.items():
        print(f"{key + ':':24} {value}")
    if report.merged_stop_spellings:
        print("merged stop spellings:")
        for canonical, variants in report.merged_stop_spellings.items():
            print(f"  {canonical!r} <- {variants}")
    if report.skipped_preview_routes:
        print(f"sample routes skipped (number already in directory): {report.skipped_preview_routes}")
    if report.preview_kept_over_blank_directory:
        print(
            "sample routes kept (directory sheet has no runs): "
            f"{report.preview_kept_over_blank_directory}"
        )
    for warning in report.warnings:
        print(f"WARNING: {warning}")
    print(f"written: {args.output}")
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

    exp = sub.add_parser("export-static-data", help="Write the frontend JSON (no database needed)")
    exp.add_argument("--output", type=str,
                     default=str(DEFAULT_DATA_DIR.parent / "fontend" / "src" / "data" / "kolkata-bus-data.json"))
    exp.set_defaults(func=cmd_export_static_data)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
