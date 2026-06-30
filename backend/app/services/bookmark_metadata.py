"""Best-effort fetch of a link's title, description, and favicon.

Used by the "Add bookmark" modal so the user can preview what a bookmark will
look like before saving. Parsing stays dependency-free (stdlib HTMLParser) and
fetches are bounded in size and time so a slow or huge page can't stall the UI.
"""

from __future__ import annotations

from html import unescape
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

import httpx

from app.services.favicon import resolve_icon
from app.services.icon_store import ingest_remote_icon

FETCH_TIMEOUT = 8.0
MAX_HTML_BYTES = 512 * 1024  # Only the <head> matters; cap the download.
USER_AGENT = "Mozilla/5.0 (compatible; Startboard/1.0; +bookmark-preview)"


class _MetadataParser(HTMLParser):
    """Collect <title> and the meta/link tags we care about from the <head>."""

    def __init__(self) -> None:
        super().__init__()
        self.title = ""
        self.og_title = ""
        self.description = ""
        self.icon_href = ""
        self._best_icon_priority = -1
        self._in_title = False
        self._head_done = False

    def handle_starttag(self, tag, attrs):
        if self._head_done:
            return
        if tag == "title":
            self._in_title = True
            return
        attr = {key.lower(): (value or "") for key, value in attrs}
        if tag == "meta":
            prop = (attr.get("property") or attr.get("name") or "").lower()
            content = attr.get("content", "").strip()
            if not content:
                return
            if prop == "og:title" and not self.og_title:
                self.og_title = content
            elif prop in {"og:description", "description"} and not self.description:
                self.description = content
        elif tag == "link":
            rel = (attr.get("rel") or "").lower()
            href = attr.get("href", "").strip()
            if not href or "icon" not in rel:
                return
            # Prefer apple-touch / explicitly-sized icons over a bare favicon.
            priority = 2 if "apple-touch" in rel else (1 if attr.get("sizes") else 0)
            if priority > self._best_icon_priority:
                self._best_icon_priority = priority
                self.icon_href = href

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        elif tag == "head":
            self._head_done = True

    def handle_data(self, data):
        if self._in_title and not self._head_done:
            self.title += data


def _normalize_url(url: str) -> str:
    cleaned = (url or "").strip()
    if not cleaned:
        return ""
    if "://" not in cleaned:
        cleaned = f"https://{cleaned}"
    parsed = urlparse(cleaned)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return ""
    return cleaned


def fetch_link_metadata(url: str) -> dict:
    """Return ``{title, description, icon_url}`` for *url* (best effort).

    Network or parse failures degrade to a favicon-only result rather than
    raising, so the modal always has something to show.
    """
    normalized = _normalize_url(url)
    if not normalized:
        raise ValueError("A valid http(s) URL is required")

    fallback_icon = ingest_remote_icon(resolve_icon(normalized))
    result = {"title": "", "description": "", "icon_url": fallback_icon}

    try:
        with httpx.Client(follow_redirects=True, timeout=FETCH_TIMEOUT) as client:
            with client.stream("GET", normalized, headers={"User-Agent": USER_AGENT}) as response:
                response.raise_for_status()
                content_type = response.headers.get("content-type", "")
                if "html" not in content_type.lower():
                    return result
                chunks: list[bytes] = []
                total = 0
                for chunk in response.iter_bytes():
                    chunks.append(chunk)
                    total += len(chunk)
                    if total >= MAX_HTML_BYTES:
                        break
                final_url = str(response.url)
        html = b"".join(chunks).decode("utf-8", errors="replace")
    except Exception:
        return result

    parser = _MetadataParser()
    try:
        parser.feed(html)
    except Exception:
        return result

    title = unescape((parser.og_title or parser.title).strip())
    description = unescape(parser.description.strip())
    result["title"] = title[:200]
    result["description"] = description[:500]
    if parser.icon_href:
        absolute_icon = urljoin(final_url, parser.icon_href)
        ingested = ingest_remote_icon(absolute_icon)
        if ingested:
            result["icon_url"] = ingested
    return result
