#!/usr/bin/env python3
import os
from pathlib import Path
import re
import sys


def main():
    source = Path.home() / ".claude/mods/dev-dashboard/hooks/flower.ts"
    try:
        definition = source.read_text()
        width = int(re.search(r"width:\s*(\d+)", definition).group(1))
        height = int(re.search(r"height:\s*(\d+)", definition).group(1))
        pixels = "".join(re.findall(r"'([0-9a-f]+)'", definition))
        if len(pixels) != width * height * 6:
            return 1
    except (OSError, AttributeError, ValueError):
        return 1

    def pixel(column, row):
        if row >= height:
            return None
        offset = (row * width + column) * 6
        color = tuple(int(pixels[offset + index:offset + index + 2], 16) for index in (0, 2, 4))
        red, green, blue = color
        return color if (red * 299 + green * 587 + blue * 114) / 1000 >= 40 else None

    use_color = sys.stdout.isatty() and os.environ.get("TERM") != "dumb" and "NO_COLOR" not in os.environ
    lines = []
    for row in range(0, height, 2):
        cells = []
        for column in range(width):
            upper, lower = pixel(column, row), pixel(column, row + 1)
            if upper is None and lower is None:
                cells.append("\033[0m " if use_color else " ")
                continue
            character = "▀" if upper is not None else "▄"
            foreground = upper if upper is not None else lower
            if use_color:
                red, green, blue = foreground
                colors = f"\033[38;2;{red};{green};{blue}m"
                colors += f"\033[48;2;{lower[0]};{lower[1]};{lower[2]}m" if upper is not None and lower is not None else "\033[49m"
                cells.append(colors + character)
            else:
                cells.append("█" if upper is not None and lower is not None else character)
        lines.append("  " + "".join(cells) + ("\033[0m" if use_color else ""))
    sys.stdout.write("\n" + "\n".join(lines) + "\n\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
