"""SQLite storage. Everything lives in one file inside PIFA_DATA_DIR (a Docker volume)."""
import os
from sqlmodel import SQLModel, Session, create_engine

DATA_DIR = os.environ.get("PIFA_DATA_DIR", "/data")
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "pifa.db")

engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})


def init_db() -> None:
    from . import models  # noqa: F401  (register tables)
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
