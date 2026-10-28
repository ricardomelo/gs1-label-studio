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
