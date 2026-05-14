"""Application entrypoint: FastAPI app, middleware, and startup hooks."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.requests import Request

from app.api.router import api_router
from app.core.config import get_settings
from app.core.exceptions import DomainError, EntityNotFoundError
from app.core.logger import setup_logging
from app.db.session import dispose_engine, init_db


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """
    Run startup and shutdown tasks around the serving loop.

    Args:
        _app: FastAPI application instance (unused but required by ASGI).
    """
    settings = get_settings()
    effective_level = "DEBUG" if settings.debug else settings.log_level
    setup_logging(effective_level)
    import app.models  # noqa: F401 — register ORM mappers with Base.metadata

    await init_db()
    yield
    await dispose_engine()


def create_app() -> FastAPI:
    """
    Build and configure the FastAPI application.

    Returns:
        Fully wired FastAPI instance.
    """
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api_router)

    @app.exception_handler(EntityNotFoundError)
    async def handle_not_found(_request: Request, exc: EntityNotFoundError) -> JSONResponse:
        """Map missing entity errors to HTTP 404."""
        return JSONResponse(status_code=404, content={"detail": str(exc)})

    @app.exception_handler(DomainError)
    async def handle_domain(_request: Request, exc: DomainError) -> JSONResponse:
        """Map other domain errors to HTTP 400."""
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    return app


app = create_app()
