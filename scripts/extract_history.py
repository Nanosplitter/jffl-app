"""Build src/history/archive.json from the commissioner's workbook.

The workbook stays out of the repo. Pass its path as the only argument.
Games need both scores. 2026 is omitted because that season is unfinished.
"""

import json
import sys
import zipfile
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
LEAGUES = ["Combined", "Premier", "Championship", "League One", "JFFL"]
LEAGUE_INDEX = {
    "Combined(Old)": 0,
    "Premier": 1,
    "Championship": 2,
    "League One": 3,
    "JFFL": 4,
}
TYPES = ["Season", "Cup", "Superbowl"]
TYPE_INDEX = {name: index for index, name in enumerate(TYPES)}


def column_row(ref: str) -> tuple[int, int]:
    column = ""
    row = ""
    for char in ref:
        if char.isalpha():
            column += char
        else:
            row += char
    number = 0
    for char in column:
        number = number * 26 + ord(char) - 64
    return number, int(row)


def shared_strings(book: zipfile.ZipFile) -> list[str]:
    root = ET.fromstring(book.read("xl/sharedStrings.xml"))
    values = []
    for item in root.findall(f"{{{NS}}}si"):
        values.append("".join((node.text or "") for node in item.iter(f"{{{NS}}}t")))
    return values


def sheet_targets(book: zipfile.ZipFile) -> dict[str, str]:
    relationships = ET.fromstring(book.read("xl/_rels/workbook.xml.rels"))
    targets = {rel.attrib["Id"]: rel.attrib["Target"] for rel in relationships}
    workbook = ET.fromstring(book.read("xl/workbook.xml"))
    found = {}
    for sheet in workbook.findall(f"{{{NS}}}sheets/{{{NS}}}sheet"):
        target = targets[sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]]
        if not target.startswith("xl/"):
            target = "xl/" + target
        found[sheet.attrib["name"]] = target
    return found


def load_sheet(book: zipfile.ZipFile, target: str, strings: list[str]) -> dict[int, dict[int, str]]:
    root = ET.fromstring(book.read(target))
    rows: dict[int, dict[int, str]] = defaultdict(dict)
    for cell in root.iter(f"{{{NS}}}c"):
        ref = cell.attrib.get("r")
        if not ref:
            continue
        column, row = column_row(ref)
        value = cell.find(f"{{{NS}}}v")
        if cell.attrib.get("t") == "s" and value is not None and value.text:
            rows[row][column] = strings[int(value.text)]
        elif value is not None and value.text is not None:
            rows[row][column] = value.text
    return rows


def number(value: str | None) -> float | None:
    if value is None or value in {"", "-"}:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def whole(value: float | None) -> int | float | None:
    if value is None:
        return None
    if value.is_integer():
        return int(value)
    return round(value, 2)


def season_week(label: str | None) -> int | None:
    if not label:
        return None
    text = str(label).strip().lower().replace("week", "").replace("wk", "")
    return int(text) if text.isdigit() else None


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: extract_history.py WORKBOOK.xlsx")
    source = Path(sys.argv[1])
    with zipfile.ZipFile(source) as book:
        strings = shared_strings(book)
        targets = sheet_targets(book)
        games_sheet = load_sheet(book, targets["Table"], strings)
        seasons_sheet = load_sheet(book, targets["InputData"], strings)

    games = []
    for row, cells in games_sheet.items():
        if row == 1 or not cells.get(1):
            continue
        season = int(float(cells[1]))
        if season >= 2026:
            continue
        league = LEAGUE_INDEX.get(cells.get(2, ""))
        kind = TYPE_INDEX.get(cells.get(3, ""))
        score_a = number(cells.get(7))
        score_b = number(cells.get(8))
        if league is None or kind is None or score_a is None or score_b is None:
            continue
        label = cells.get(4)
        round_value: int | str | None = season_week(label) if kind == 0 else (str(label) if label else None)
        if round_value is None:
            continue
        games.append([
            season,
            league,
            kind,
            round_value,
            cells.get(5),
            cells.get(6),
            whole(score_a),
            whole(score_b),
        ])

    seasons = []
    for row, cells in seasons_sheet.items():
        if row < 32 or not cells.get(3):
            continue
        try:
            season = int(float(cells.get(2, "")))
        except ValueError:
            continue
        if season >= 2026:
            continue
        league = LEAGUE_INDEX.get(cells.get(4, ""))
        if league is None:
            continue
        cup_column = {1: 8, 2: 9, 3: 10}.get(league)
        seasons.append([
            season,
            cells[3],
            league,
            whole(number(cells.get(11))),
            whole(number(cells.get(7))),
            whole(number(cells.get(6))),
            whole(number(cells.get(cup_column))) if cup_column else None,
            whole(number(cells.get(12))),
            whole(number(cells.get(13))),
            whole(number(cells.get(16))),
            whole(number(cells.get(17))),
            whole(number(cells.get(18))),
            whole(number(cells.get(19))),
            whole(number(cells.get(21))),
        ])

    games.sort(key=lambda item: (item[0], item[1], item[2], str(item[3]), item[4], item[5]))
    seasons.sort(key=lambda item: (item[0], item[2], item[1]))
    payload = {"leagues": LEAGUES, "types": TYPES, "games": games, "seasons": seasons}
    destination = Path(__file__).resolve().parents[1] / "src" / "history" / "archive.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"games {len(games)} seasons {len(seasons)} bytes {destination.stat().st_size}")


if __name__ == "__main__":
    main()
