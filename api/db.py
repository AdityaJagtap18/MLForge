from __future__ import annotations

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

MLFORGE_FILES_DIR = os.environ.get(
    "MLFORGE_FILES_DIR",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "MLForge_files"),
)
DEFAULT_SQLITE_PATH = os.path.join(MLFORGE_FILES_DIR, "mlforge.db")
DATABASE_URL = os.environ.get("MLFORGE_DATABASE_URL", f"sqlite:///{DEFAULT_SQLITE_PATH}")

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    os.makedirs(MLFORGE_FILES_DIR, exist_ok=True)
    from api import db_models  # noqa: F401 (registers models on Base.metadata)

    Base.metadata.create_all(bind=engine)
