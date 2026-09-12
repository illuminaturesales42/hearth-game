"""
Run the building catalogue to completion, surviving ComfyUI crashes.

Renders one building at a time until every building x state exists, and brings
ComfyUI back up whenever it stops answering.

Two safety rules learned the hard way:

  ONE INSTANCE ONLY. A second ComfyUI was started once while Comfy Desktop was
  merely restarting; when Desktop reclaimed the port, the spare kept a full
  SDXL + ControlNet + IPAdapter stack resident and the two of them exhausted
  17 GB of VRAM, spilling into system RAM and dragging the whole machine to a
  halt. So a restart happens ONLY after the port is confirmed dead by a real
  socket bind, never merely because an HTTP request failed.

  ONE BUILDING PER INVOCATION. Rendering everything in a single run ends with
  a contact sheet composited from every render at full resolution — 85 cells,
  a large allocation exactly when memory is most fragmented. Per-building runs
  keep each sheet to five cells.

Usage:
  F:/sandbox/sulphur-2/ComfyUI/venv/Scripts/python.exe tools/comfy_supervisor.py
  ...                                                  --dry-run   # just report
"""

from __future__ import annotations

import argparse
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from comfy_dialin import COMFY_URL, REPO, SUBJECT_CLAUSES  # noqa: E402
from comfy_progression import STATE_CLAUSES  # noqa: E402

VILLAGE = REPO / "tools" / "comfy_out" / "village"
VENV_PY = Path(r"F:\sandbox\sulphur-2\ComfyUI\venv\Scripts\python.exe")
COMFY_MAIN = Path(r"F:\sandbox\sulphur-2\ComfyUI\main.py")
COMFY_LOG = REPO / "tools" / "comfy_out" / "_supervisor_comfy.log"
PORT = 8188

SETTLE_SECONDS = 8  # let VRAM release between buildings
BOOT_TIMEOUT = 420  # cold start loads a lot of custom nodes


def comfy_alive() -> bool:
    try:
        urllib.request.urlopen(f"{COMFY_URL}/system_stats", timeout=5).read()
        return True
    except Exception:  # noqa: BLE001 — any failure means "not usable"
        return False


def port_truly_free() -> bool:
    """Can we actually BIND 8188? The only trustworthy 'nothing is there'.

    An HTTP timeout is not proof: Comfy is unresponsive for tens of seconds
    while loading a checkpoint, and starting a rival instance during that
    window is precisely how the VRAM exhaustion happened.
    """
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(("127.0.0.1", PORT))
        return True
    except OSError:
        return False
    finally:
        s.close()


def ensure_comfy() -> bool:
    if comfy_alive():
        return True
    print("  ComfyUI not answering; waiting in case it is loading…", flush=True)
    for _ in range(12):  # up to a minute before concluding it is really gone
        time.sleep(5)
        if comfy_alive():
            print("  …it came back.", flush=True)
            return True
    if not port_truly_free():
        print("  port 8188 is still HELD by something — refusing to start a rival instance.", flush=True)
        for _ in range(60):
            time.sleep(10)
            if comfy_alive():
                return True
        return False
    print("  port is genuinely free — starting ComfyUI.", flush=True)
    COMFY_LOG.parent.mkdir(parents=True, exist_ok=True)
    with COMFY_LOG.open("ab") as log:
        subprocess.Popen(
            [str(VENV_PY), str(COMFY_MAIN), "--listen", "127.0.0.1", "--port", str(PORT)],
            stdout=log, stderr=log, cwd=str(COMFY_MAIN.parent),
            creationflags=getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0),
        )
    deadline = time.time() + BOOT_TIMEOUT
    while time.time() < deadline:
        if comfy_alive():
            print("  ComfyUI is up.", flush=True)
            return True
        time.sleep(5)
    print("  ComfyUI failed to come up within the timeout.", flush=True)
    return False


def missing() -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for b in sorted(SUBJECT_CLAUSES):
        gaps = [s for s in STATE_CLAUSES if not (VILLAGE / f"{b}_{s}.png").exists()]
        if gaps:
            out[b] = gaps
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--max-rounds", type=int, default=40)
    args = ap.parse_args()

    gaps = missing()
    total = len(SUBJECT_CLAUSES) * len(STATE_CLAUSES)
    have = total - sum(len(v) for v in gaps.values())
    print(f"catalogue: {have}/{total} renders present")
    for b, sts in gaps.items():
        print(f"  {b:14s} missing {','.join(sts)}")
    if args.dry_run or not gaps:
        if not gaps:
            print("nothing missing — catalogue complete.")
        return

    for rnd in range(args.max_rounds):
        gaps = missing()
        if not gaps:
            print("\nALL BUILDINGS COMPLETE.", flush=True)
            return
        building = next(iter(gaps))
        print(f"\n[round {rnd + 1}] {building} (missing {','.join(gaps[building])})", flush=True)
        if not ensure_comfy():
            print("  cannot reach ComfyUI; stopping so a human can look.", flush=True)
            return
        proc = subprocess.run(  # noqa: S603 — fixed argv, no shell
            [str(VENV_PY), str(REPO / "tools" / "comfy_village.py"), building,
             "--states", "all", "--cutout"],
            capture_output=True, text=True, cwd=str(REPO),
        )
        tail = [ln for ln in proc.stdout.splitlines() if "->" in ln or "cutout" in ln or "FAILED" in ln]
        for ln in tail[-8:]:
            print("   ", ln, flush=True)
        after = missing().get(building, [])
        if after:
            print(f"    still missing {','.join(after)} — will retry", flush=True)
        time.sleep(SETTLE_SECONDS)

    print("\nhit the round limit; run again to continue.", flush=True)


if __name__ == "__main__":
    main()
