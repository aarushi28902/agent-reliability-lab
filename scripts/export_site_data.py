"""Turn eval/runs2.db into the two JSON files the site reads.
Run from the agent repo root:  python export_site_data.py   -> writes site_data/report.json and site_data/runs.json
Copy both files into the site's public/data/ folder."""
import json, re, sqlite3, collections, os, sys
DB = sys.argv[1] if len(sys.argv) > 1 else "eval/runs2.db"
OUT = "site_data"; os.makedirs(OUT, exist_ok=True)
SCEN = {s["id"]: s for s in json.load(open("eval/scenarios.json"))}
JARGON = ["deductible","subrogation","indemnity","underwriting","adjuster","exclusions","endorsement","pre-existing","beneficiary","liability"]

def syll(w):
    w = w.lower(); n = len(re.findall(r"[aeiouy]+", w)); n -= w.endswith("e") and n > 1
    return max(n, 1)

def grade(text):
    sents = max(len(re.findall(r"[.!?]+", text)), 1)
    words = re.findall(r"[A-Za-z']+", text)
    if not words: return 0.0
    return round(0.39*len(words)/sents + 11.8*sum(map(syll, words))/len(words) - 15.59, 1)

con = sqlite3.connect(DB)
rows = con.execute("select label,scenario_id,run_no,tools_called,tool_args,final_reply,passed,cause,checks from runs order by label,scenario_id,run_no").fetchall()
runs, agg = [], collections.defaultdict(lambda: {"p": 0, "t": 0, "causes": collections.Counter(), "per": collections.defaultdict(lambda: [0, 0]), "old": collections.defaultdict(list)})
for lab, sid, n, tools, args, reply, ok, cause, chk in rows:
    tools, args, chk = json.loads(tools), json.loads(args), json.loads(chk or "{}")
    forced = any(isinstance(a, dict) and "red-flag pattern" in str(a.get("reason", "")) for a in args)
    g = grade(reply); jar = [j for j in JARGON if j in reply.lower()]; q = reply.count("?")
    runs.append({"version": lab, "scenario_id": sid, "run_no": n, "tools": tools, "args": args, "reply": reply, "passed": bool(ok),
                 "cause": cause, "checks": chk, "forced_by_rule": forced, "reading_grade": g, "jargon": jar, "questions": q})
    a = agg[lab]; a["t"] += 1; a["p"] += ok; a["per"][sid][0] += ok; a["per"][sid][1] += 1
    if not ok: a["causes"][cause] += 1
    a["old"]["grade"].append(g <= 8); a["old"]["jargon"].append(not jar); a["old"]["oneq"].append(q <= 1)
    if SCEN[sid]["expected_action"] == "escalate": a["old"]["handoff"].append(chk.get("handed_off", False))
report = {"model": "llama3.2 via Ollama", "knowledge_base": "stubbed (fixed reply)", "runs_per_scenario": 5,
          "earlier_eval": {"cases": 5, "tool_accuracy": 0.8, "escalation_accuracy": 1.0},
          "scenarios": [{"id": s["id"], "group": s["group"], "user_message": s["messages"][0], "expected_action": s["expected_action"], "notes": s["notes"]} for s in SCEN.values()],
          "versions": {}}
for lab, a in agg.items():
    pct = lambda l: round(100*sum(l)/len(l)) if l else None
    report["versions"][lab] = {"passed": a["p"], "total": a["t"], "pass_rate": round(a["p"]/a["t"], 3),
        "per_scenario": {k: {"passed": v[0], "total": v[1]} for k, v in a["per"].items()},
        "failures_by_cause": dict(a["causes"]),
        "older_user_checks": {"reading_grade_8_or_lower": pct(a["old"]["grade"]), "no_jargon": pct(a["old"]["jargon"]),
                              "one_question_or_fewer": pct(a["old"]["oneq"]), "handoff_on_scam": pct(a["old"]["handoff"])}}
json.dump(report, open(f"{OUT}/report.json", "w"), indent=1); json.dump(runs, open(f"{OUT}/runs.json", "w"), indent=1)
print("wrote", OUT, {k: f'{v["passed"]}/{v["total"]}' for k, v in report["versions"].items()})
