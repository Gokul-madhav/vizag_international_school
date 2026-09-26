"""FastAPI application entry point for the Vizag International School demo."""

# Load .env before anything imports os.getenv (the academics repo is built at
# import time based on SUPABASE_* variables).
try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # python-dotenv is optional
    pass

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .academics import repo as academic_repo
from .academics import router as academics_router
from .data import ADMIN_DASHBOARD, SCHOOL_NAME, STUDENT_DASHBOARD, STUDENT_LIST
from .leads import router as leads_router
from .portal import router as portal_router
from .reports import router as reports_router
from .settings import router as settings_router
from .students import router as students_router
from .whatsapp import router as whatsapp_router

app = FastAPI(
    title="Vizag International School API",
    description="Demo API powering the student and admin dashboards + academic structure.",
    version="1.1.0",
)

# Extra exact origins (e.g. a custom domain) — comma-separated in .env / the
# hosting dashboard: CORS_ORIGINS=https://vizagschool.example,https://foo.com
_extra_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]

# Localhost dev ports + any *.vercel.app deployment (prod and preview builds
# both get a URL under this domain, so a fixed list can't cover them).
# Override entirely with CORS_ORIGIN_REGEX if the frontend lives elsewhere.
_origin_regex = os.getenv(
    "CORS_ORIGIN_REGEX",
    r"http://(localhost|127\.0\.0\.1):\d+|https://([\w-]+\.)*vercel\.app",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
        *_extra_origins,
    ],
    allow_origin_regex=_origin_regex,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(academics_router)
app.include_router(students_router)
app.include_router(settings_router)
app.include_router(portal_router)
app.include_router(reports_router)
app.include_router(whatsapp_router)
app.include_router(leads_router)


@app.get("/api/health")
def health():
    return {"status": "ok", "school": SCHOOL_NAME, "academicsBackend": academic_repo.backend}


@app.get("/api/admin/dashboard")
def admin_dashboard():
    """Everything the admin dashboard needs in a single payload."""
    return ADMIN_DASHBOARD


@app.get("/api/student/dashboard")
def student_dashboard():
    """Sample data for the demo student dashboard."""
    return STUDENT_DASHBOARD


@app.get("/api/student/list")
def student_list():
    return {"students": STUDENT_LIST}


@app.get("/")
def root():
    return {
        "message": "Vizag International School API",
        "docs": "/docs",
        "academicsBackend": academic_repo.backend,
        "endpoints": [
            "/api/health",
            "/api/admin/dashboard",
            "/api/student/dashboard",
            "/api/student/list",
            "/api/academics/tree",
            "/api/academics/classes",
            "/api/academics/sections",
            "/api/academics/subjects",
            "/api/academics/topics",
            "/api/academics/assignments",
            "/api/academics/questions",
            "/api/students",
        ],
    }
