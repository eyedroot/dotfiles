#!/usr/bin/env python3
"""Convert a small markdown subset into ADF, with table-cell decorations.

Markdown upload keeps inline code and fenced code, but it cannot colour a
cell or put a code block inside a table cell. This builds the ADF directly
so a results table can carry:

  --code-cols   column headers whose every cell becomes inline code
  --status-col  column header whose cell becomes a status lozenge
                (text containing "OK" -> green, "error"/"fail" -> red,
                 "미실행"/"skip" -> neutral, otherwise yellow)
  --json-cells  JSON objects inside any cell: short ones get a code mark,
                ones longer than --json-block-min characters become a
                json code block under the cell text

Supported markdown: ## headings, "- " bullets, pipe tables, paragraphs,
`code`, [text](url), bare http(s) URLs, ``` fenced blocks (outside tables).
Pipe characters inside cells are not supported.
"""
import argparse
import json
import re
import sys

INLINE = re.compile(r"(`[^`]+`|\[[^\]]+\]\([^)]+\)|https?://[^\s)|]+)")
JSON_OBJ = re.compile(r"\{[^{}]*\}")


def text(t, marks=None):
    node = {"type": "text", "text": t}
    if marks:
        node["marks"] = marks
    return node


def inline(src, json_cells=False):
    out, pos = [], 0
    for m in INLINE.finditer(src):
        if m.start() > pos:
            out.extend(plain(src[pos:m.start()], json_cells))
        tok = m.group(0)
        if tok.startswith("`"):
            out.append(text(tok[1:-1], [{"type": "code"}]))
        elif tok.startswith("["):
            label, url = re.match(r"\[([^\]]+)\]\(([^)]+)\)", tok).groups()
            out.append(text(label, [{"type": "link", "attrs": {"href": url}}]))
        else:
            out.append(text(tok, [{"type": "link", "attrs": {"href": tok}}]))
        pos = m.end()
    if pos < len(src):
        out.extend(plain(src[pos:], json_cells))
    return out or [text("")]


def plain(src, json_cells):
    if not json_cells:
        return [text(src)] if src else []
    out, pos = [], 0
    for m in JSON_OBJ.finditer(src):
        if m.start() > pos:
            out.append(text(src[pos:m.start()]))
        out.append(text(m.group(0), [{"type": "code"}]))
        pos = m.end()
    if pos < len(src):
        out.append(text(src[pos:]))
    return out


def paragraph(src, json_cells=False):
    src = src.strip()
    return {"type": "paragraph", "content": inline(src, json_cells)} if src else {"type": "paragraph"}


def code_block(body, language=None):
    node = {"type": "codeBlock", "content": [text(body)]}
    if language:
        node["attrs"] = {"language": language}
    return node


def status_node(value):
    v = value.lower()
    if "ok" in v and "error" not in v:
        color = "green"
    elif "error" in v or "fail" in v:
        color = "red"
    elif "미실행" in v or "skip" in v or v in ("-", ""):
        color = "neutral"
    else:
        color = "yellow"
    return {"type": "status", "attrs": {"text": value, "color": color}}


def cell(kind, value, header, opts):
    attrs = {"colspan": 1, "rowspan": 1}
    if kind == "tableHeader":
        return {"type": kind, "attrs": attrs, "content": [paragraph(value)]}
    value = value.strip()
    if header in opts.status_cols and value:
        return {"type": kind, "attrs": attrs, "content": [{"type": "paragraph", "content": [status_node(value)]}]}
    if header in opts.code_cols and value:
        return {"type": kind, "attrs": attrs, "content": [{"type": "paragraph", "content": [text(value, [{"type": "code"}])]}]}
    content = []
    if opts.json_cells:
        blocks = [m for m in JSON_OBJ.finditer(value) if len(m.group(0)) >= opts.json_block_min]
        if blocks:
            rest = value
            for m in blocks:
                rest = rest.replace(m.group(0), "").strip()
            content.append(paragraph(rest, True))
            for m in blocks:
                content.append(code_block(pretty_json(m.group(0)), "json"))
            return {"type": kind, "attrs": attrs, "content": content}
    return {"type": kind, "attrs": attrs, "content": [paragraph(value, opts.json_cells)]}


def pretty_json(s):
    try:
        return json.dumps(json.loads(s), ensure_ascii=False, indent=2)
    except ValueError:
        return s


def split_row(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def convert(md, opts):
    doc, lines, i = [], md.splitlines(), 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        if line.startswith("```"):
            lang = line[3:].strip() or None
            body, i = [], i + 1
            while i < len(lines) and not lines[i].startswith("```"):
                body.append(lines[i]); i += 1
            i += 1
            doc.append(code_block("\n".join(body), lang))
            continue
        if line.startswith("#"):
            level = len(line) - len(line.lstrip("#"))
            doc.append({"type": "heading", "attrs": {"level": level}, "content": inline(line[level:].strip())})
            i += 1
            continue
        if line.startswith("- "):
            items = []
            while i < len(lines) and lines[i].startswith("- "):
                items.append({"type": "listItem", "content": [paragraph(lines[i][2:], opts.json_cells)]}); i += 1
            doc.append({"type": "bulletList", "content": items})
            continue
        if line.startswith("|"):
            header = split_row(line); i += 1
            if i < len(lines) and re.match(r"^\|?\s*:?-", lines[i]):
                i += 1
            rows = [{"type": "tableRow", "content": [cell("tableHeader", h, h, opts) for h in header]}]
            while i < len(lines) and lines[i].startswith("|"):
                cells = split_row(lines[i]); cells += [""] * (len(header) - len(cells))
                rows.append({"type": "tableRow", "content": [cell("tableCell", c, h, opts) for c, h in zip(cells[: len(header)], header)]})
                i += 1
            doc.append({"type": "table", "attrs": {"isNumberColumnEnabled": False, "layout": "default"}, "content": rows})
            continue
        doc.append(paragraph(line, opts.json_cells)); i += 1
    return {"type": "doc", "version": 1, "content": doc}


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--in", dest="infile", required=True)
    p.add_argument("--out", dest="outfile", required=True)
    p.add_argument("--code-cols", default="", help="comma-separated column headers rendered as inline code")
    p.add_argument("--status-cols", default="", help="comma-separated column headers rendered as status lozenges")
    p.add_argument("--json-cells", action="store_true", help="wrap {...} JSON in cells and bullets as code; long ones become code blocks")
    p.add_argument("--json-block-min", type=int, default=60, help="JSON length that switches from inline code to a code block")
    opts = p.parse_args()
    opts.code_cols = {c.strip() for c in opts.code_cols.split(",") if c.strip()}
    opts.status_cols = {c.strip() for c in opts.status_cols.split(",") if c.strip()}
    md = open(opts.infile, encoding="utf-8").read()
    doc = convert(md, opts)
    with open(opts.outfile, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    print(f"wrote {opts.outfile}")


if __name__ == "__main__":
    main()
