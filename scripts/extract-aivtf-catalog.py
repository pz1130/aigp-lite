#!/usr/bin/env python3
"""Extract the AIVTF catalog from the official Process Checklist workbook into
prisma/seeds/aivtf-catalog.json. Reproducible: re-run after a workbook update.

The workbook is not redistributed here; download the AIVTF Process Checklist
from https://aiverifyfoundation.sg/ and place it at SRC below."""
import json, re, sys, zipfile, xml.etree.ElementTree as ET
from pathlib import Path

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
RID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
SRC = Path("docs/reference/aivtf/aivtf-process-checklist.xlsx")
OUT = Path("prisma/seeds/aivtf-catalog.json")

AI_TYPE = {
    "generative ai": "GENAI_ONLY",
    "traditional ai": "TRADITIONAL_ONLY",
    "traditional and generative ai": "ALL",
}

def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.strip().lower()).strip("-")

def col(ref):
    s = re.match(r"([A-Z]+)", ref).group(1); n = 0
    for ch in s: n = n * 26 + (ord(ch) - 64)
    return n

def main():
    z = zipfile.ZipFile(SRC)
    ss = ET.fromstring(z.read("xl/sharedStrings.xml"))
    strings = ["".join(t.text or "" for t in si.iter(NS + "t")) for si in ss]
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    relmap = {r.get("Id"): r.get("Target")
              for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
    sheets = [(s.get("name"), relmap[s.get(RID)]) for s in wb.iter(NS + "sheet")]

    def cv(c):
        t = c.get("t"); v = c.find(NS + "v")
        if v is None: return ""
        if t == "s": return strings[int(v.text)]
        if t == "inlineStr": return "".join(tt.text or "" for tt in c.iter(NS + "t"))
        return v.text or ""

    principles = []
    for name, tgt in sheets:
        m = re.match(r"\s*(\d+)\.\s*(.+)", name)
        if not m: continue
        num = int(m.group(1))
        sh = ET.fromstring(z.read("xl/" + tgt))
        rows = list(sh.iter(NS + "row"))
        title, blurb = "", None
        for r in rows[:4]:
            cells = {col(c.get("r")): cv(c) for c in r.iter(NS + "c")}
            txt = cells.get(1, "").strip()
            if not txt: continue
            if not title: title = txt
            elif blurb is None and txt != "Process Checklist": blurb = txt
        outcomes, by_code = [], {}
        for r in rows[4:]:
            cells = {col(c.get("r")): cv(c) for c in r.iter(NS + "c")}
            pcode = str(cells.get(4, "")).strip()
            if not re.match(r"^\d+\.\d+\.\d+$", pcode): continue
            ocode = ".".join(pcode.split(".")[:2])
            otext = str(cells.get(3, "")).strip()
            if ocode not in by_code:
                o = {"code": ocode, "text": otext, "order": len(outcomes) + 1, "processes": []}
                by_code[ocode] = o; outcomes.append(o)
            elif otext and not by_code[ocode]["text"]:
                by_code[ocode]["text"] = otext
            o = by_code[ocode]
            ai_raw = str(cells.get(2, "")).strip().lower()
            o["processes"].append({
                "code": pcode,
                "text": str(cells.get(5, "")).strip(),
                "typeOfAI": AI_TYPE.get(ai_raw, "ALL"),
                "evidenceType": (str(cells.get(6, "")).strip() or None),
                "evidenceGuidance": (str(cells.get(7, "")).strip() or None),
                "order": len(o["processes"]) + 1,
            })
        principles.append({"num": num, "key": slug(title), "title": title,
                           "blurb": blurb, "order": num, "outcomes": outcomes})

    principles.sort(key=lambda p: p["num"])
    data = {
        "_meta": {
            "source": "AI Verify Testing Framework (AIVTF) Process Checklist — IMDA & AI Verify Foundation",
            "license": "See aivtf-catalog.LICENSE",
            "extractedFrom": str(SRC),
        },
        "principles": principles,
    }
    OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf8")
    n_out = sum(len(p["outcomes"]) for p in principles)
    n_proc = sum(len(o["processes"]) for p in principles for o in p["outcomes"])
    print(f"principles={len(principles)} outcomes={n_out} processes={n_proc} -> {OUT}")
    # NOTE: the workbook's own "Outcome ID" column (col 1) yields 88 distinct
    # outcomes across the 11 principles (1.1-1.7, 2.1-2.2, 3.1-3.12, 4.1-4.10,
    # 5.1-5.14, 6.1-6.7, 7.1-7.11, 8.1-8.5, 9.1-9.12, 10.1-10.6, 11.1-11.2),
    # not 85 as originally assumed. Verified by cross-checking the Outcome ID
    # column against the derived outcome codes (process-code prefixes) for
    # every group; they match exactly, with no gaps or duplicates. 85 appears
    # to have been an estimate; 88 is the figure that matches the source data.
    if (len(principles), n_out, n_proc) != (11, 88, 112):
        print("WARN: counts differ from expected 11/88/112", file=sys.stderr)

if __name__ == "__main__":
    main()
