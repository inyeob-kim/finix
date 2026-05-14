"""Structured logging setup for the application."""

import logging
import sys
from typing import Any


def resolve_log_level(level: str | int) -> int:
    """Resolve level name/int into Python logging level constant."""
    if isinstance(level, int):
        return level
    maybe = logging.getLevelName(level.upper())
    return maybe if isinstance(maybe, int) else logging.INFO


def setup_logging(level: str | int = logging.INFO) -> None:
    """
    Configure root logger with a consistent format for console output.

    Args:
        level: Logging level for the root logger.
    """
    resolved_level = resolve_log_level(level)
    root = logging.getLogger()
    root.setLevel(resolved_level)
    if root.handlers:
        for handler in root.handlers:
            handler.setLevel(resolved_level)
        return
    handler = logging.StreamHandler(sys.stdout)
    formatter = logging.Formatter(
        "%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    handler.setFormatter(formatter)
    handler.setLevel(resolved_level)
    root.addHandler(handler)
    root.setLevel(resolved_level)


def get_logger(name: str) -> logging.Logger:
    """
    Return a module-level logger.

    Args:
        name: Typically __name__ of the calling module.

    Returns:
        Configured Logger instance.
    """
    return logging.getLogger(name)
