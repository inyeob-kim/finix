"""Small shared helpers with no framework dependencies."""


def build_placeholder_body(prefix: str, seed: str) -> str:
    """
    Build deterministic placeholder content for demos and tests.

    Args:
        prefix: Logical section prefix (e.g. scenario, testcase).
        seed: Human-readable seed string incorporated into the body.

    Returns:
        Multi-line placeholder string suitable for persistence.
    """
    lines = [
        f"[{prefix}] generated content",
        f"seed={seed}",
        "Replace this stub with real generator output.",
    ]
    return "\n".join(lines)
