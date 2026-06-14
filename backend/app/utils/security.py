"""Password hashing helpers (passlib + bcrypt)."""

from passlib.context import CryptContext

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Return a bcrypt hash for a plaintext password."""
    # bcrypt has a 72-byte limit; truncate defensively to avoid backend errors.
    return _pwd_context.hash(password[:72])


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a plaintext password against a stored hash."""
    try:
        return _pwd_context.verify(password[:72], password_hash)
    except ValueError:
        return False
