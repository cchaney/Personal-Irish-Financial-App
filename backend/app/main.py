"""PIFA (Personal Irish Financial App) — private, self-hosted personal finance for Ireland."""
import os

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .db import init_db
from .routers import analysis, core

app = FastAPI(title="PIFA — Personal Irish Financial App", version="0.1.0", docs_url="/api/docs", openapi_url="/api/openapi.json")
app.include_router(core.router)
app.include_router(analysis.router)


@app.on_event("startup")
def startup():
    init_db()


@app.get("/api/health")
def health():
    return {"ok": True}


STATIC_DIR = os.environ.get("PIFA_STATIC_DIR", os.path.join(os.path.dirname(__file__), "..", "static"))
if os.path.isdir(STATIC_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        candidate = os.path.join(STATIC_DIR, path)
        if path and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))
