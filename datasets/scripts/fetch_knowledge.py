"""Downloads the documents listed in datasets/knowledge/manifest.json and converts them to plain text
for the assistant's retrieval index (backend/services/rag).

    python datasets/scripts/fetch_knowledge.py            # fetch what is missing, rebuild text
    python datasets/scripts/fetch_knowledge.py --refresh  # download everything again

Output (git-ignored; some sources are copyrighted):
    datasets/knowledge/raw/<id>.<pdf|html>
    datasets/knowledge/text/<id>.txt

PDF text comes from `pdftotext` (poppler) when it is installed, otherwise from `pypdf` (pip install pypdf).
`pdftotext` keeps table rows together, so it is preferred for the cost-norm tables.
"""
import html
import json
import re
import shutil
import subprocess
import sys
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "knowledge"
RAW = ROOT / "raw"
TEXT = ROOT / "text"
USER_AGENT = "Mozilla/5.0 (poultry planner knowledge builder)"


def download(url: str, target: Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=120) as response:
        target.write_bytes(response.read())


def pdf_to_text(path: Path, layout: bool) -> str:
    if shutil.which("pdftotext"):
        # Without -enc, Windows builds write Latin-1, which turns dashes, bullets and "°" into replacement characters.
        args = ["pdftotext", "-enc", "UTF-8"] + (["-layout"] if layout else []) + [str(path), "-"]
        return subprocess.run(args, capture_output=True, check=True).stdout.decode("utf-8", "replace")
    try:
        from pypdf import PdfReader
    except ImportError:
        sys.exit("Install poppler (pdftotext) or `pip install pypdf` to read PDFs.")
    return "\n\n".join((page.extract_text() or "") for page in PdfReader(str(path)).pages)


class _TextExtractor(HTMLParser):
    BLOCKS = {"p", "div", "br", "tr", "li", "h1", "h2", "h3", "h4", "h5", "h6", "table", "ul", "ol", "section"}

    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript", "head"):
            self.skip += 1
        elif tag in self.BLOCKS:
            self.parts.append("\n")
        elif tag in ("td", "th"):
            self.parts.append(" | ")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript", "head"):
            self.skip = max(0, self.skip - 1)
        elif tag in self.BLOCKS:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def _blocks_to_text(markup: str) -> str:
    parser = _TextExtractor()
    parser.feed(markup)
    return html.unescape("".join(parser.parts))


def _next_data_articles(raw: str) -> list[str]:
    """Next.js sites (Vikaspedia) ship the article as HTML inside a JSON blob instead of in the page body."""
    match = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', raw, flags=re.S)
    if not match:
        return []
    found: list[str] = []

    def walk(node) -> None:
        if isinstance(node, str):
            if len(node) > 400 and "<" in node and ">" in node:
                found.append(node)
        elif isinstance(node, dict):
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    try:
        walk(json.loads(match.group(1)))
    except ValueError:
        return []
    return found


def html_to_text(path: Path) -> str:
    data = path.read_bytes()
    try:
        raw = data.decode("utf-8")
    except UnicodeDecodeError:
        raw = data.decode("cp1252", "replace")  # older sites (TNAU Agritech) are Windows-1252
    raw = re.sub(r"<!--.*?-->", " ", raw, flags=re.S)
    articles = _next_data_articles(raw)
    if articles:
        return "\n\n".join(_blocks_to_text(article) for article in articles)
    return _blocks_to_text(raw)


def tidy(text: str) -> str:
    text = text.replace("\r", "").replace("\x0c", "\n\n").replace(" ", " ")
    text = re.sub(r"[ \t]+", " ", text)
    lines = [line.strip() for line in text.split("\n")]
    # Drop bare page numbers and rows of dots or dashes.
    lines = [line for line in lines if not re.fullmatch(r"(page )?\d{1,3}|[.\-_=\s|]{1,}", line, flags=re.I)]
    lines = [line for line in lines if line.count(" | ") < 4]  # site navigation bars
    text = "\n".join(lines)
    return re.sub(r"\n{3,}", "\n\n", text).strip() + "\n"


def main() -> None:
    refresh = "--refresh" in sys.argv
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    RAW.mkdir(parents=True, exist_ok=True)
    TEXT.mkdir(parents=True, exist_ok=True)

    for source in manifest["sources"]:
        extension = "pdf" if source["format"] == "pdf" else "html"
        raw_path = RAW / f"{source['id']}.{extension}"
        if refresh or not raw_path.exists():
            print(f"download {source['id']}")
            try:
                download(source["url"], raw_path)
            except Exception as err:  # keep going: a missing source is reported, not fatal
                print(f"  FAILED: {err}")
                continue
        text = pdf_to_text(raw_path, source.get("layout", False)) if extension == "pdf" else html_to_text(raw_path)
        text = tidy(text)
        (TEXT / f"{source['id']}.txt").write_text(text, encoding="utf-8")
        print(f"  {source['id']}: {len(text.split()):,} words")


if __name__ == "__main__":
    main()
