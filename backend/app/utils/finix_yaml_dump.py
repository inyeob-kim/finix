"""YAML dump helpers that keep CBS code-like strings quoted."""

from __future__ import annotations

import re
from typing import Any

import yaml

# Leading-zero digits, bare digits, and YAML booleans/nulls must stay strings.
_FORCE_QUOTE_STR_RE = re.compile(
    r"^(?:"
    r"0\d+"  # 08, 01, 007 …
    r"|\d+"  # pure digits that must not become ints on js-yaml 1.2 reload
    r"|(?i:true|false|null|yes|no|on|off)"
    r")$"
)


class _FinixYamlDumper(yaml.SafeDumper):
    """SafeDumper that quotes ambiguous scalar strings."""


def _represent_str(dumper: yaml.Dumper, data: str) -> yaml.Node:
    style = "'" if _FORCE_QUOTE_STR_RE.match(data) else None
    return dumper.represent_scalar("tag:yaml.org,2002:str", data, style=style)


_FinixYamlDumper.add_representer(str, _represent_str)


def dump_finix_yaml(payload: Any) -> str:
    """Dump YAML for service rules; preserve string codes like ``'08'``."""
    text = yaml.dump(
        payload,
        Dumper=_FinixYamlDumper,
        allow_unicode=True,
        default_flow_style=False,
        sort_keys=False,
    ).strip()
    return f"{text}\n"
