"""Export Narc's incident investigations into data/incidents.json for the Investigations, MITRE map and
Blast radius tabs.

    NARC_PY=~/Desktop/hackathon\ project  .venv/bin/python scripts/export_incidents.py

Runs the Python investigation engine (github.com/Varsh1009/narc) in offline mode on its Acme Cloud
synthetic logs: four cases, each scored on three suspects (bad change, vendor outage, attack) with clues
that cite log events. Search results come from its SIMULATED fixtures. Nothing here is live data.
"""
import json
import os
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data" / "incidents.json"
sys.path.insert(0, os.path.expanduser(os.environ.get("NARC_PY", "~/Desktop/hackathon project")))

from narc import server  # noqa: E402

state = server.state("offline")
cited = set()
for c in state["cases"]:
    inv = c["investigation"]
    cited |= {i for clues in inv["suspects"].values() for clue in clues for i in clue["events"]}
    cited |= {t["id"] for t in inv["timeline"]}
events = {e["id"]: e for e in server.events(",".join(sorted(cited)))}

out = {
    "source": "Acme Cloud: synthetic logs (14 days, 9 systems), investigated offline by Narc's engine",
    "search_mode": state["search_mode"],
    "generated": state["generated"],
    "event_count": state["event_count"],
    "log_sources": state["log_sources"],
    "cases": [{k: c[k] for k in ("id", "title", "date", "severity", "question", "story", "plain_fix", "investigation")}
              for c in state["cases"]],
    "incidents": [{k: i[k] for k in ("id", "title", "story", "steps", "goals", "goals_blocked", "verdict", "techniques",
                                     "scope_agents")} for i in state["incidents"]],
    "techniques": state["techniques"],
    "tactics": state["tactics"],
    "blast": {c["id"]: server.blast_graph(f"case:{c['id']}") for c in state["cases"]},
    "events": events,
}
OUT.parent.mkdir(exist_ok=True)
OUT.write_text(json.dumps(out, indent=1, default=str))
print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB): {len(out['cases'])} cases, {len(events)} cited events")
