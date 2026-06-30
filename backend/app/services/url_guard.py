"""SSRF guard for server-side fetches of user-provided URLs.

Any endpoint that fetches a URL the user controls must resolve the host first,
reject non-public IPs, and then connect to one of the validated IPs directly.
That closes the DNS-rebinding window between validation and the actual socket
connect while still preserving the original Host header and TLS SNI.
"""

from __future__ import annotations

import http.client
import ipaddress
import socket
import ssl
from dataclasses import dataclass
from urllib.parse import urljoin, urlsplit

ALLOWED_SCHEMES = {"http", "https"}


class UnsafeUrlError(ValueError):
    """Raised when a URL targets a non-public or otherwise disallowed address."""


@dataclass(frozen=True)
class ResolvedPublicUrl:
    """A URL whose hostname has been resolved and pinned to a public IP."""

    url: str
    scheme: str
    host: str
    port: int
    connect_host: str
    path_and_query: str
    host_header: str


@dataclass(frozen=True)
class FetchResponse:
    """Minimal HTTP response details for SSRF-safe fetches."""

    url: str
    status: int
    headers: dict[str, str]
    body: bytes

    @property
    def is_redirect(self) -> bool:
        return self.status in {301, 302, 303, 307, 308}


def _ip_is_public(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def _resolve_public_ip(host: str, port: int) -> str:
    try:
        infos = socket.getaddrinfo(
            host, port, proto=socket.IPPROTO_TCP, type=socket.SOCK_STREAM
        )
    except socket.gaierror as exc:
        raise UnsafeUrlError("Could not resolve host") from exc
    if not infos:
        raise UnsafeUrlError("Could not resolve host")

    chosen_ip = ""
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
            ip = ip.ipv4_mapped
        if not _ip_is_public(ip):
            raise UnsafeUrlError("URL resolves to a non-public address")
        if not chosen_ip:
            chosen_ip = ip.compressed
    if not chosen_ip:
        raise UnsafeUrlError("Could not resolve host")
    return chosen_ip


def resolve_public_url(url: str) -> ResolvedPublicUrl:
    """Resolve *url* and pin it to a validated public IP."""
    parts = urlsplit(url)
    scheme = parts.scheme.lower()
    if scheme not in ALLOWED_SCHEMES:
        raise UnsafeUrlError("Only http and https URLs are allowed")
    if parts.username or parts.password:
        raise UnsafeUrlError("URLs with embedded credentials are not allowed")
    host = parts.hostname
    if not host:
        raise UnsafeUrlError("URL has no host")

    port = parts.port or (443 if scheme == "https" else 80)
    path_and_query = parts.path or "/"
    if parts.query:
        path_and_query = f"{path_and_query}?{parts.query}"
    host_header = (
        host if (scheme, port) in {("http", 80), ("https", 443)} else f"{host}:{port}"
    )
    connect_host = _resolve_public_ip(host, port)
    return ResolvedPublicUrl(
        url=url,
        scheme=scheme,
        host=host,
        port=port,
        connect_host=connect_host,
        path_and_query=path_and_query,
        host_header=host_header,
    )


def validate_public_url(url: str) -> str:
    """Return *url* unchanged if it resolves only to public addresses."""
    resolve_public_url(url)
    return url


class _PinnedHTTPConnection(http.client.HTTPConnection):
    def __init__(self, resolved: ResolvedPublicUrl, timeout: float):
        super().__init__(host=resolved.host, port=resolved.port, timeout=timeout)
        self._connect_host = resolved.connect_host

    def connect(self) -> None:
        self.sock = self._create_connection(
            (self._connect_host, self.port), self.timeout, self.source_address
        )


class _PinnedHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, resolved: ResolvedPublicUrl, timeout: float):
        context = ssl.create_default_context()
        super().__init__(
            host=resolved.host, port=resolved.port, timeout=timeout, context=context
        )
        self._connect_host = resolved.connect_host

    def connect(self) -> None:
        sock = self._create_connection(
            (self._connect_host, self.port), self.timeout, self.source_address
        )
        self.sock = self._context.wrap_socket(sock, server_hostname=self.host)


def _read_limited(response: http.client.HTTPResponse, max_bytes: int | None) -> bytes:
    if max_bytes is None:
        return response.read()

    chunks: list[bytes] = []
    total = 0
    chunk_size = min(64 * 1024, max_bytes)
    while total < max_bytes:
        chunk = response.read(min(chunk_size, max_bytes - total))
        if not chunk:
            break
        chunks.append(chunk)
        total += len(chunk)
    return b"".join(chunks)


def fetch_public_url(
    url: str,
    *,
    timeout: float,
    max_bytes: int | None = None,
    headers: dict[str, str] | None = None,
) -> FetchResponse:
    """Fetch *url* by connecting to a previously validated public IP."""
    resolved = resolve_public_url(url)
    connection_cls = (
        _PinnedHTTPSConnection if resolved.scheme == "https" else _PinnedHTTPConnection
    )
    request_headers = {
        "Host": resolved.host_header,
        "Accept-Encoding": "identity",
        "Connection": "close",
    }
    if headers:
        request_headers.update(headers)

    conn = connection_cls(resolved, timeout)
    try:
        conn.request("GET", resolved.path_and_query, headers=request_headers)
        response = conn.getresponse()
        body = _read_limited(response, max_bytes)
        header_map = {key.lower(): value for key, value in response.getheaders()}
        return FetchResponse(
            url=url, status=response.status, headers=header_map, body=body
        )
    finally:
        conn.close()


def resolve_public_redirect(base_url: str, location: str) -> str:
    """Resolve a redirect target and ensure the next hop is still public."""
    return resolve_public_url(urljoin(base_url, location)).url
