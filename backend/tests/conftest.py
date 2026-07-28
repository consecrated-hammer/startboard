"""Shared pytest setup.

`app.db.database` calls `init_db()` on import (house style), which creates the
SQLite file and its parent directory. The default path is `/data`, which is the
container's volume mount and is not writable in local checkouts or on CI
runners. Point it at a throwaway directory before any app module is imported.
"""

import os
import tempfile
from pathlib import Path

_TEST_DATA_DIR = Path(tempfile.mkdtemp(prefix="startboard-tests-"))

os.environ.setdefault("STARTBOARD_DB_PATH", str(_TEST_DATA_DIR / "startboard.db"))
