"""
Expected results from the GS1 Digital Link Resolver CE Expansion Pack's label studio, the reference this project's port
follows (ADR 0004). Runs the resolver's own Python code at a pinned commit and writes JSON fixtures that the TypeScript
tests compare with, so that nothing the resolver did right is lost in the port.

    git clone https://github.com/ricardomelo/GS1_DigitalLink_Resolver_CE resolver && git -C resolver checkout <COMMIT>
    python3 -m venv venv && venv/bin/pip install segno "zint-bindings>=1.2,<2" "fonttools>=4.50,<5" "pillow>=10.4,<13"
    venv/bin/python -I scripts/resolver-reference/golden.py resolver packages/core/test/fixtures/resolver
"""
import json
import subprocess
import sys
from pathlib import Path

COMMIT = "eab13aa6a597a3f064c374abc3bdc5a88837bf86"  # v3.1.0, 23 October 2026

resolver, out = Path(sys.argv[1]), Path(sys.argv[2])
head = subprocess.run(["git", "-C", str(resolver), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
if head != COMMIT:
    sys.exit(f"the resolver checkout is at {head}, not {COMMIT}")
sys.path.insert(0, str(resolver / "portal"))

import label  # noqa: E402

AIS = ["01", "00", "414", "417", "253", "8003", "8004", "8017", "8018", "8006", "255", "8010"]


def _raises(call) -> bool:
    try:
        call()
        return False
    except Exception:  # noqa: BLE001 - the reference's refusal, whatever its type
        return True


def write(name: str, content: dict) -> None:
    (out / name).write_text(json.dumps({"resolverCommit": COMMIT, **content}, separators=(",", ":")) + "\n")


def checked(environment: str, symbol: str, size: int, linear: bool, linear_size, ai):
    options = label.LabelOptions(uri="https://id.gs1.org/01/09506000134352", hri_lines=(), show_hri=False,
                                 size=size, symbol=symbol, environment=environment,
                                 linear=("ean13", "9506000134352") if linear else None, linear_size=linear_size)
    try:
        label.check_environment(options, ai)
        return "ok"
    except label.OutOfRange as error:
        return error.code


environments = {name: {**env, "keys": list(env["keys"]) if isinstance(env["keys"], tuple) else env["keys"]}
                for name, env in label.ENVIRONMENTS.items()}
checks = []
for environment in label.ENVIRONMENTS:
    for symbol in label.SYMBOLS:
        for size in label.SIZES:
            for linear, linear_size in [(False, None), (True, None), (True, 80), (True, 100), (True, 200)]:
                for ai in [None, "01", "00"]:
                    checks.append([environment, symbol, size, linear, linear_size, ai,
                                   checked(environment, symbol, size, linear, linear_size, ai)])
write("environments.json", {
    "sizes": list(label.SIZES),
    "symbols": list(label.SYMBOLS),
    "environments": environments,
    "environmentsFor": {ai: label.environments_for(ai) for ai in AIS},
    "sizesFor": {name: label.sizes_for(name) for name in label.ENVIRONMENTS},
    "sizesForWithLinear": {name: label.sizes_for(name, True) for name in label.ENVIRONMENTS},
    "linearSizesFor": {name: label.linear_sizes_for(name) for name in label.ENVIRONMENTS if label.ENVIRONMENTS[name]["linear"]},
    "checks": checks,
})
print(f"{len(checks)} environment checks written to {out}")

# ----------------------------------------------------------------------------------------------------- EAN/UPC (1.4)
import linear  # noqa: E402

LINEAR_CASES = [("ean13", "9506000134352"), ("ean13", "4006381333931"), ("ean13", "0012345678905"),
                ("upca", "614141000036"), ("upca", "036000291452"), ("ean8", "95012346"), ("ean8", "96385074"),
                ("upce", "01234565"), ("upce", "06543217"), ("upce", "01200003")]
write("linear.json", {
    "encodings": [{"kind": k, "digits": d, "modules": e.modules, "extended": sorted(e.extended), "quiet": list(e.quiet),
                   "barHeight": e.bar_height, "digitsUnder": [list(t) for t in e.digits]}
                  for k, d in LINEAR_CASES for e in [linear.encode(k, d)]],
    "symbolFor": [[g, c, list(linear.symbol_for(g, c))]
                  for g, c in [("09506000134352", "auto"), ("00614141000036", "auto"), ("00000095012346", "auto"),
                               ("00012345000065", "upce"), ("00012345000065", "auto")]],
    "notPossible": [[g, c] for g, c in [("19506000134359", "auto"), ("09506000134352", "upce"),
                                         ("00614141000036", "upce"), ("00000095012346", "upce"), ("0950600013435", "auto")]
                    if _raises(lambda g=g, c=c: linear.symbol_for(g, c))],
})

# ------------------------------------------------------------------------------------------------------ layout (1.4)
URI_SHORT = "https://id.gs1.org/01/09506000134352"
URI_LONG = "https://id.gs1.org/01/09506000134352/10/ABC123/21/12345?17=271231&3103=001250"
ES = "(01)09506000134352(17)271231(10)ABC123"


def layout_case(**kw):
    options = label.LabelOptions(**kw)
    try:
        lay = label._layout(options)
    except label.DoesNotFit as error:
        return {"options": kw, "doesNotFit": error.params}
    sym = label.symbol(options)
    rows = len(sym.matrix)
    n2d = len(label._qr_rects([list(r) for r in sym.matrix], 0, 0))
    return {"options": kw, "width": lay.width, "height": lay.height, "xMm": lay.x_mm, "modules": rows,
            "version": getattr(sym, "version", None),
            "texts": [[t[0], t[1], t[2], t[3], len(t) > 4] for t in lay.texts],
            "linearRects": [list(r) for r in lay.rects[n2d:]]}


def kw(**options):
    base = {"uri": URI_SHORT, "hri_lines": ("(01)09506000134352",), "show_hri": True}
    base.update(options)
    if "hri_lines" in options:
        base["hri_lines"] = tuple(options["hri_lines"])
    return base


cases = [
    kw(),
    kw(show_hri=False),
    kw(uri=URI_LONG, hri_lines=["(01)09506000134352", "(10)ABC123", "(21)12345"]),
    kw(error="h"), kw(error="l"), kw(error="q", size=150),
    kw(version=5), kw(version=2, uri=URI_LONG), kw(version=10, error="h"),
    kw(size=80), kw(size=200),
    kw(linear=("ean13", "9506000134352")),
    kw(linear=("ean13", "9506000134352"), size=150, linear_size=80),
    kw(linear=("upca", "614141000036"), size=120),
    kw(linear=("ean8", "95012346"), hri_lines=["(01)00000095012346"]),
    kw(linear=("upce", "01234565"), linear_size=200),
    kw(symbol="dm", uri=URI_LONG),
    kw(symbol="gs1dm", element_string=ES, hri_lines=["(01)09506000134352", "(17)271231", "(10)ABC123"]),
    kw(symbol="gs1dm", element_string=ES, environment="healthcare", size=120),
    kw(symbol="gs1dm", element_string="(00)106141411234567897", environment="logistics", hri_lines=["(00)106141411234567897"]),
    kw(symbol="dm", environment="dpm", size=90, show_hri=False),
    kw(environment="retail-gd", linear=("ean13", "9506000134352"), size=80),
    kw(environment="distribution", size=200, linear=("ean13", "9506000134352"), linear_size=100),
]
font = label._font()
units, cap, descent = label._font_metrics()
hri_paths = [[text, x, baseline, em, label._hri_path(text, x, baseline, em)]
             for text, x, baseline, em in [("(01)09506000134352", 2.5, 40.25, 6.2), ("(10)ABC123", 0, 10, 4),
                                           ("(21)xyz/%-.+", 1.25, 7.5, 3.3), ("9", 0, 0, 10)]]
write("layouts.json", {
    "constants": {"QUIET_ZONE": label.QUIET_ZONE, "MARGIN": label.MARGIN, "TEXT_GAP": label.TEXT_GAP,
                  "LINE_SPACING": label.LINE_SPACING, "TEXT_HEIGHT_MM": label.TEXT_HEIGHT_MM,
                  "LINEAR_GAP": label.LINEAR_GAP},
    "font": {"unitsPerEm": units, "capHeight": cap, "descent": descent,
             "widths": {t: label._text_width(t, 10) for t in ["(01)09506000134352", "ABC xyz", "0123456789"]}},
    "layouts": [layout_case(**c) for c in cases],
    "hriPaths": hri_paths,
})
print(f"{len(cases)} layouts written")

# --------------------------------------------------------------------------------------- data attributes (1.9)
import gs1dict  # noqa: E402
import syntax  # noqa: E402  (logs that the C engine is absent: only the parts that do not need it are used)

dictionary = gs1dict.load()
reference = syntax.Engine.__new__(syntax.Engine)
reference.attributes = gs1dict.data_attributes(dictionary)
reference.families = syntax.decimal_families(reference.attributes)
reference.path_ais = gs1dict.path_ais(dictionary)
reference.available, reference.release = True, dictionary["release"]


def outcome(call):
    try:
        return {"ok": list(call())}
    except syntax.ValidationError as error:
        return {"error": error.code, "params": {k: v for k, v in error.params.items()}}


DECIMALS = [("310n", "0,5"), ("310n", "1.25"), ("310n", "123,456"), ("310n", "12"), ("310n", "1,2,3"),
            ("310n", "1,1234567"), ("310n", "abc"), ("3103", "0,5"), ("3103", "500"), ("3103", "1,2345"),
            ("392n", "12,5"), ("3922", "12,5"), ("393n", "98612,30"), ("393n", "986x2"), ("392n", "1234567890123456"),
            ("17", "271231"), ("315n", "  2,5 "), ("310n", "0"), ("310n", "000,500"), ("330n", "1,5")]
DAY_ZERO = [("17", "271200"), ("17", "270200"), ("17", "271231"), ("15", "260000"), ("11", "270100"), ("7006", "270100")]


def day_zero(ai, value):
    syntax._refuse_day_zero(ai, value, reference.attributes[ai]["components"])
    return []


write("attributes.json", {
    "release": dictionary["release"], "dictionaryDate": dictionary["dictionary"],
    "describe": reference.describe(),
    "pathAis": {key: sorted(ais) for key, ais in reference.path_ais.items()},
    "decimals": [[ai, value, outcome(lambda ai=ai, value=value: reference.resolve_decimal(ai, value))]
                 for ai, value in DECIMALS],
    "dayZero": [[ai, value, outcome(lambda ai=ai, value=value: day_zero(ai, value))] for ai, value in DAY_ZERO],
})
print("attributes written")

# ------------------------------------------------------------------------------------------------------------ EPC (1.8)
import epc  # noqa: E402
import gcp  # noqa: E402

EPC_CASES = [  # key, value, qualifiers, partition lengths, filters
    ("01", "09506000134376", {"21": "12345"}, range(6, 13), [1]),
    ("01", "09506000134376", {"21": "S1001"}, [7, 9, 12], [1, 0]),
    ("01", "09506000134376", {"21": "012"}, [7], [1]),
    ("01", "09506000134376", {"21": "274877906943"}, [7], [3]),       # 2^38 - 1: the largest 96-bit serial
    ("01", "09506000134376", {"21": "274877906944"}, [7], [3]),       # 2^38: SGTIN-198
    ("01", "09506000134376", {"21": "ABCDEFGHIJKLMNOPQRST"}, [7], [2]),
    ("01", "09506000134376", {"21": "a/b%c&d"}, [7], [7]),
    ("01", "09506000134376", {"10": "B42", "22": "V1", "21": "7"}, [7], [1]),
    ("00", "106141411234567897", {}, range(6, 13), [0, 6]),
    ("414", "9506000134376", {}, [7, 9], [0]),
    ("414", "9506000134376", {"254": "123"}, [7], [0]),
    ("414", "9506000134376", {"254": "A-1"}, [7], [0]),
    ("8003", "09506000134376123", {}, [7, 12], [0]),
    ("8003", "09506000134376ABC", {}, [7], [0]),
    ("8004", "950600012345", {}, [7], [0]),
    ("8004", "9506000ABC-12", {}, [7, 9], [0]),
    ("8018", "950600013437612342", {}, [7], [0]),
    ("8017", "950600013437612342", {}, [7], [0]),
    ("253", "9506000134376123", {}, [7], [0]),
    ("253", "9506000134376ABC", {}, [7], [0]),
    ("255", "9506000134376123", {}, [7], [0]),
    ("8010", "9506000ABC-1", {"8011": "123"}, [7], [0]),
    ("8006", "095060001343760102", {"21": "1"}, [7], [1]),
    ("8006", "095060001343760102", {"21": "XY"}, [7], [1]),
]
EPC_REFUSALS = [
    ("01", "09506000134376", {}, 7, 1),
    ("01", "09506000134376", {"21": "123456789012345678901"}, 7, 1),
    ("8003", "09506000134376", {}, 7, 0),
    ("401", "9506000ABC", {}, 7, 0),
    ("01", "09506000134376", {"21": "1"}, 5, 1),
    ("01", "09506000134376", {"21": "1"}, 7, 8),
    ("253", "9506000134376", {}, 7, 0),
]


def epc_outcome(key, value, qualifiers, length, filter_value):
    try:
        e = epc.encode(key, value, qualifiers, length, filter_value)
        return {"scheme": e.scheme, "filter": e.filter, "bits": e.bits, "hex": e.hex, "base64": e.base64,
                "tagUri": e.tag_uri, "pureIdentity": e.pure_identity}
    except epc.EpcError as error:
        return {"error": error.code, "params": error.params}


GCP_XML = ('<?xml version="1.0" encoding="UTF-8"?>\n<GCPPrefixFormatList date="2026-09-17T11:04:36.316Z">'
           '<entry prefix="950" gcpLength="7"/><entry prefix="9506" gcpLength="9"/><entry prefix="977" gcpLength="0"/>'
           '<entry prefix="0614141" gcpLength="7"/><entry prefix="5" gcpLength="8"/></GCPPrefixFormatList>')
GCP_BAD = {
    "notXml": "hello", "root": '<Other date="2026-01-01T00:00:00Z"/>',
    "doctype": '<!DOCTYPE x [<!ENTITY a "b">]><GCPPrefixFormatList date="2026-01-01T00:00:00Z"/>',
    "element": '<GCPPrefixFormatList date="2026-01-01T00:00:00Z"><x/></GCPPrefixFormatList>',
    "entry": '<GCPPrefixFormatList date="2026-01-01T00:00:00Z"><entry prefix="95" gcpLength="5"/></GCPPrefixFormatList>',
    "duplicate": ('<GCPPrefixFormatList date="2026-01-01T00:00:00Z"><entry prefix="95" gcpLength="7"/>'
                  '<entry prefix="95" gcpLength="8"/></GCPPrefixFormatList>'),
    "empty": '<GCPPrefixFormatList date="2026-01-01T00:00:00Z"></GCPPrefixFormatList>',
}


def gcp_outcome(xml):
    try:
        table = gcp.parse(xml.encode("utf-8"))
        return {"date": table.date, "count": len(table)}
    except gcp.GcpError as error:
        return {"error": error.code, "params": error.params}


table = gcp.parse(GCP_XML.encode("utf-8"))
write("epc.json", {
    "keySchemes": {k: list(v) for k, v in epc.KEY_SCHEMES.items()},
    "encodings": [[key, value, qualifiers, length, f, epc_outcome(key, value, qualifiers, length, f)]
                  for key, value, qualifiers, lengths, filters in EPC_CASES for length in lengths for f in filters],
    "refusals": [[key, value, qualifiers, length, f, epc_outcome(key, value, qualifiers, length, f)]
                 for key, value, qualifiers, length, f in EPC_REFUSALS],
    "gcp": {"xml": GCP_XML, "parsed": gcp_outcome(GCP_XML),
            "lengths": {d: table.length_for(d) for d in ["9506000134376", "9501234567890", "9771234567", "0614141000036",
                                                         "5012345", "123", "", "95"]},
            "bad": {name: gcp_outcome(xml) for name, xml in GCP_BAD.items()}},
})
print("epc written")
