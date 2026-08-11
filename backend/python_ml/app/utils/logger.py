# Shared logging setup for the microservice — console + rotating file.
# Every module calls get_logger(__name__); the root config is created once.

import logging
import os
from logging.handlers import RotatingFileHandler
from pathlib import Path

# python_ml/logs/ — parents[0]=utils, [1]=app, [2]=python_ml
LOG_DIR = Path(__file__).resolve().parents[2] / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

LOG_FORMAT = logging.Formatter("%(asctime)s | %(levelname)-8s | %(name)s | %(message)s")


def get_logger(name: str) -> logging.Logger:
    """Returns a module logger, configuring the shared handlers once."""
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger  # already configured — return as-is

    logger.setLevel(os.getenv("LOG_LEVEL", "INFO").upper())

    console = logging.StreamHandler()
    console.setFormatter(LOG_FORMAT)
    logger.addHandler(console)

    file_handler = RotatingFileHandler(
        LOG_DIR / "python_ml.log",
        maxBytes=5 * 1024 * 1024,
        backupCount=3,
        encoding="utf-8",
    )
    file_handler.setFormatter(LOG_FORMAT)
    logger.addHandler(file_handler)

    logger.propagate = False
    return logger
