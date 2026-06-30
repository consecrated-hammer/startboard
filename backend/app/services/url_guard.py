"""SSRF guard for server-side fetches of user-provided URLs.

Any endpoint that fetches a URL the user controls (the bookmark live-preview)
must route it through :func:`validate_public_url` first, and re-validate every
redirect hop, so the request can only ever reach a public internet address.
Loopback, link-local (incl. cloud-metadata 169.254.169.254), private LAN,
reserved, and multicast ranges are all rejected.
"""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlsplit

ALLOWED_SCHEMES = {"http", "https"}


class UnsafeUrlError(ValueError):
    """Raised when a URL targets a non-public or otherwise disallowed address."""


def _ip_is_public(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def validate_public_url(url: str) -> str:
    """Return *url* unchanged if it targets a public address, else raise.

    The host is resolved via DNS and *every* resolved address must be public —
    a host that resolves to even one internal address is rejected.
    """
    parts = urlsplit(url)
    if parts.scheme.lower() not in ALLOWED_SCHEMES:
        raise UnsafeUrlError("Only http and https URLs are allowed")
    if parts.username or parts.password:
        raise UnsafeUrlError("URLs with embedded credentials are not allowed")
    host = parts.hostname
    if not host:
        raise UnsafeUrlError("URL has no host")

    port = parts.port or (443 if parts.scheme.lower() == "https" else 80)
    try:
        infos = socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise UnsafeUrlError("Could not resolve host") from exc
    if not infos:
        raise UnsafeUrlError("Could not resolve host")

    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        # Unwrap IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1) before classifying.
        if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
            ip = ip.ipv4_mapped
        if not _ip_is_public(ip):
            raise UnsafeUrlError("URL resolves to a non-public address")
    return url
