"""Password hashing helpers (bcrypt).

Uses the ``bcrypt`` library directly rather than passlib: passlib 1.7.4 is
unmaintained and its bcrypt backend probe breaks on bcrypt >= 5. Hashing the
first 72 bytes of the UTF-8 password reproduces what passlib previously fed to
bcrypt, so existing ``$2b$`` hashes still verify unchanged.
"""

import bcrypt


def _prepare(password: str) -> bytes:
    # bcrypt only considers the first 72 bytes and bcrypt 5 raises on longer
    # input, so truncate explicitly. Slicing the UTF-8 bytes matches the bytes
    # passlib hashed before, keeping previously stored hashes verifiable.
    return password.encode("utf-8")[:72]


def hash_password(password: str) -> str:
    """Return a bcrypt hash for a plaintext password."""
    return bcrypt.hashpw(_prepare(password), bcrypt.gensalt()).decode("ascii")


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a plaintext password against a stored hash."""
    try:
        return bcrypt.checkpw(_prepare(password), password_hash.encode("ascii"))
    except (ValueError, TypeError):
        return False
