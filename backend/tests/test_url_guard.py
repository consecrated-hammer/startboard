import socket

import pytest

from app.services import url_guard
from app.services.url_guard import (
    UnsafeUrlError,
    fetch_public_url,
    resolve_public_redirect,
    resolve_public_url,
)


def test_resolve_public_url_pins_first_public_ip(monkeypatch):
    def fake_getaddrinfo(host, port, proto=None, type=None):
        assert host == "example.com"
        assert port == 8443
        assert proto == socket.IPPROTO_TCP
        assert type == socket.SOCK_STREAM
        return [
            (
                socket.AF_INET,
                socket.SOCK_STREAM,
                socket.IPPROTO_TCP,
                "",
                ("93.184.216.34", port),
            ),
            (
                socket.AF_INET6,
                socket.SOCK_STREAM,
                socket.IPPROTO_TCP,
                "",
                ("2606:2800:220:1:248:1893:25c8:1946", port, 0, 0),
            ),
        ]

    monkeypatch.setattr(url_guard.socket, "getaddrinfo", fake_getaddrinfo)

    resolved = resolve_public_url("https://example.com:8443/path?q=1")

    assert resolved.scheme == "https"
    assert resolved.host == "example.com"
    assert resolved.port == 8443
    assert resolved.connect_host == "93.184.216.34"
    assert resolved.path_and_query == "/path?q=1"
    assert resolved.host_header == "example.com:8443"


def test_resolve_public_url_rejects_any_private_answer(monkeypatch):
    def fake_getaddrinfo(host, port, proto=None, type=None):
        return [
            (
                socket.AF_INET,
                socket.SOCK_STREAM,
                socket.IPPROTO_TCP,
                "",
                ("93.184.216.34", port),
            ),
            (
                socket.AF_INET,
                socket.SOCK_STREAM,
                socket.IPPROTO_TCP,
                "",
                ("10.0.0.8", port),
            ),
        ]

    monkeypatch.setattr(url_guard.socket, "getaddrinfo", fake_getaddrinfo)

    with pytest.raises(UnsafeUrlError, match="non-public"):
        resolve_public_url("https://example.com")


def test_fetch_public_url_uses_pinned_http_connection(monkeypatch):
    requests = []

    class FakeResponse:
        status = 200

        def __init__(self):
            self._chunks = [b"hello ", b"world"]

        def read(self, amount=None):
            if not self._chunks:
                return b""
            chunk = self._chunks.pop(0)
            if amount is None or len(chunk) <= amount:
                return chunk
            self._chunks.insert(0, chunk[amount:])
            return chunk[:amount]

        def getheaders(self):
            return [("Content-Type", "text/plain")]

    class FakeConnection:
        def __init__(self, resolved, timeout):
            self.resolved = resolved
            self.timeout = timeout

        def request(self, method, path, headers):
            requests.append(
                (
                    self.resolved.connect_host,
                    self.resolved.host,
                    self.timeout,
                    method,
                    path,
                    headers,
                )
            )

        def getresponse(self):
            return FakeResponse()

        def close(self):
            return None

    monkeypatch.setattr(
        url_guard,
        "resolve_public_url",
        lambda url: url_guard.ResolvedPublicUrl(
            url=url,
            scheme="http",
            host="example.com",
            port=80,
            connect_host="93.184.216.34",
            path_and_query="/index.html",
            host_header="example.com",
        ),
    )
    monkeypatch.setattr(url_guard, "_PinnedHTTPConnection", FakeConnection)

    response = fetch_public_url(
        "http://example.com/index.html",
        timeout=3.5,
        max_bytes=32,
        headers={"User-Agent": "Startboard-Test"},
    )

    assert response.status == 200
    assert response.body == b"hello world"
    assert response.headers["content-type"] == "text/plain"
    assert requests == [
        (
            "93.184.216.34",
            "example.com",
            3.5,
            "GET",
            "/index.html",
            {
                "Host": "example.com",
                "Accept-Encoding": "identity",
                "Connection": "close",
                "User-Agent": "Startboard-Test",
            },
        )
    ]


def test_resolve_public_redirect_validates_next_hop(monkeypatch):
    calls = []

    def fake_resolve(url):
        calls.append(url)
        return url_guard.ResolvedPublicUrl(
            url=url,
            scheme="https",
            host="cdn.example.com",
            port=443,
            connect_host="93.184.216.34",
            path_and_query="/next",
            host_header="cdn.example.com",
        )

    monkeypatch.setattr(url_guard, "resolve_public_url", fake_resolve)

    redirected = resolve_public_redirect("https://example.com/base", "/next")

    assert redirected == "https://example.com/next"
    assert calls == ["https://example.com/next"]
