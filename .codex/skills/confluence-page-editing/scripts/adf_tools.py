#!/usr/bin/env python3
"""Edit and check Confluence ADF documents without touching marks or attrs.

Subcommands:
  text            print every text node with its path and marks
  replace         apply [old, new] pairs; each old must match exactly once
  strip-textcolor drop textColor marks whose color equals a sibling backgroundColor
  diff            list changed text nodes and any textColor marks that appeared
"""

import argparse
import json
import sys
from pathlib import Path


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def dump(doc, path):
    Path(path).write_text(
        json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )


def text_nodes(node, path=()):
    if isinstance(node, dict):
        if node.get("type") == "text":
            yield path, node
        for key, value in node.items():
            yield from text_nodes(value, path + (key,))
    elif isinstance(node, list):
        for index, value in enumerate(node):
            yield from text_nodes(value, path + (index,))


def mark_summary(node):
    parts = []
    for mark in node.get("marks", []) or []:
        color = (mark.get("attrs") or {}).get("color")
        parts.append(f"{mark['type']}({color})" if color else mark["type"])
    return ",".join(parts)


def path_str(path):
    return "/".join(str(p) for p in path)


def cmd_text(args):
    doc = load(args.infile)
    for path, node in text_nodes(doc):
        marks = mark_summary(node)
        suffix = f"  [{marks}]" if marks else ""
        print(f"{path_str(path)}\t{node['text']!r}{suffix}")


def cmd_replace(args):
    doc = load(args.infile)
    edits = load(args.edits)
    nodes = list(text_nodes(doc))
    failed = False
    for old, new in edits:
        hits = [(path, node) for path, node in nodes if old in node["text"]]
        total = sum(node["text"].count(old) for _, node in hits)
        if total != 1:
            failed = True
            print(f"NOT APPLIED ({total} matches): {old!r}", file=sys.stderr)
            continue
        path, node = hits[0]
        node["text"] = node["text"].replace(old, new)
        print(f"applied at {path_str(path)}: {old!r} -> {new!r}")
    if failed:
        sys.exit(1)
    dump(doc, args.outfile)
    print(f"wrote {args.outfile}")


def strip_same_color_textcolor(doc):
    removed = []
    for path, node in text_nodes(doc):
        marks = node.get("marks") or []
        backgrounds = {
            (m.get("attrs") or {}).get("color", "").lower()
            for m in marks
            if m.get("type") == "backgroundColor"
        }
        kept = []
        for mark in marks:
            color = (mark.get("attrs") or {}).get("color", "").lower()
            if mark.get("type") == "textColor" and color in backgrounds:
                removed.append((path, node["text"], color))
            else:
                kept.append(mark)
        if kept:
            node["marks"] = kept
        elif "marks" in node:
            del node["marks"]
    return removed


def cmd_strip_textcolor(args):
    doc = load(args.infile)
    removed = strip_same_color_textcolor(doc)
    for path, text, color in removed:
        print(f"removed textColor {color} at {path_str(path)}: {text!r}")
    print(f"removed {len(removed)} marks")
    dump(doc, args.outfile)
    print(f"wrote {args.outfile}")


def cmd_diff(args):
    before = {path_str(p): n for p, n in text_nodes(load(args.before))}
    after = {path_str(p): n for p, n in text_nodes(load(args.after))}
    changed = 0
    for path in sorted(set(before) | set(after)):
        b, a = before.get(path), after.get(path)
        if b is None or a is None:
            changed += 1
            print(f"{'added' if b is None else 'removed'} {path}: {(a or b)['text']!r}")
            continue
        if b["text"] != a["text"]:
            changed += 1
            print(f"changed {path}:\n  - {b['text']!r}\n  + {a['text']!r}")
        if mark_summary(b) != mark_summary(a):
            changed += 1
            print(f"marks changed {path}: [{mark_summary(b)}] -> [{mark_summary(a)}]")
    new_textcolor = [
        path
        for path, node in after.items()
        if any(m.get("type") == "textColor" for m in node.get("marks") or [])
        and not any(
            m.get("type") == "textColor"
            for m in (before.get(path) or {}).get("marks") or []
        )
    ]
    print(f"{changed} differences")
    if new_textcolor:
        print("new textColor marks appeared at:", ", ".join(new_textcolor), file=sys.stderr)
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("text")
    p.add_argument("--in", dest="infile", required=True)
    p.set_defaults(func=cmd_text)

    p = sub.add_parser("replace")
    p.add_argument("--in", dest="infile", required=True)
    p.add_argument("--out", dest="outfile", required=True)
    p.add_argument("--edits", required=True, help="JSON file: [[old, new], ...]")
    p.set_defaults(func=cmd_replace)

    p = sub.add_parser("strip-textcolor")
    p.add_argument("--in", dest="infile", required=True)
    p.add_argument("--out", dest="outfile", required=True)
    p.set_defaults(func=cmd_strip_textcolor)

    p = sub.add_parser("diff")
    p.add_argument("--before", required=True)
    p.add_argument("--after", required=True)
    p.set_defaults(func=cmd_diff)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
