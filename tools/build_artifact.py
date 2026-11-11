"""Genera una sola página HTML (CSS y JS en línea) para publicarla como Artifact de claude.ai.

Uso: python3 tools/build_artifact.py <salida.html>
"""
import pathlib
import re
import sys

root = pathlib.Path(__file__).resolve().parent.parent
html = (root / "index.html").read_text(encoding="utf-8")
css = (root / "css/styles.css").read_text(encoding="utf-8")
body = re.search(r"<body>(.*)</body>", html, re.S).group(1)


def inline_script(match):
    src = match.group(1)
    return "<script>\n" + (root / src).read_text(encoding="utf-8") + "\n</script>"


body = re.sub(r'<script src="([^"]+)"></script>', inline_script, body)
page = (
    "<title>Presupuesto 2027</title>\n"
    '<meta name="claude:viewport-fit-sides" content="cover">\n'
    f"<style>\n{css}\n</style>\n{body}"
)
out = pathlib.Path(sys.argv[1])
out.write_text(page, encoding="utf-8")
print(f"{out} ({len(page) // 1024} KB)")
