"use client";
import { useEffect, useMemo, useState } from "react";

const SIMPLE_LABELS = {
  "core-001": "What is happening with my payment?",
  "elder-001": "I have trouble typing. Help me.",
  "elder-002": "Something looks strange",
};
const SIZES = [1, 1.15, 1.3];

function useData() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    Promise.all([fetch("/data/report.json").then((r) => r.json()), fetch("/data/runs.json").then((r) => r.json())])
      .then(([report, runs]) => setData({ report, runs }))
      .catch(() => setError(true));
  }, []);
  return { data, error };
}

export default function Page() {
  const { data, error } = useData();
  const [mode, setMode] = useState("simple");
  const [scale, setScale] = useState(1);
  const [scenarioId, setScenarioId] = useState(null); // null = simple home
  const [runNo, setRunNo] = useState(1);
  const [version, setVersion] = useState(null);

  useEffect(() => {
    try { const s = parseFloat(localStorage.getItem("scale")); if (SIZES.includes(s)) setScale(s); } catch (e) {}
  }, []);
  useEffect(() => {
    document.documentElement.style.setProperty("--scale", scale);
    try { localStorage.setItem("scale", String(scale)); } catch (e) {}
  }, [scale]);
  useEffect(() => { document.body.classList.toggle("dark", mode === "hood"); }, [mode]);

  const versions = useMemo(() => (data ? Object.keys(data.report.versions).sort() : []), [data]);
  const activeVersion = version || (versions.includes("v2") ? "v2" : versions[0]);

  const header = (
    <div className="pill" role="tablist" aria-label="View">
      <button role="tab" aria-selected={mode === "simple"} className={mode === "simple" ? "on" : ""} onClick={() => setMode("simple")}>Simple</button>
      <button role="tab" aria-selected={mode === "hood"} className={mode === "hood" ? "on" : ""} onClick={() => setMode("hood")}>Under the hood</button>
    </div>
  );

  if (error) return <main className="app">{header}<p className="lead">The recorded data could not be loaded. Please refresh.</p></main>;
  if (!data) return <main className="app">{header}<p className="lead">Loading…</p></main>;

  const { report, runs } = data;
  const scenarios = report.scenarios;
  const runFor = (sid, ver, n) => runs.find((r) => r.scenario_id === sid && r.version === ver && r.run_no === n);

  if (mode === "simple") {
    const sc = scenarios.find((s) => s.id === scenarioId);
    const run = sc && runFor(sc.id, activeVersion, runNo);
    const maxRuns = report.runs_per_scenario || 5;
    return (
      <main className="app">
        {header}
        {!sc ? (
          <>
            <h1>Claims Helper</h1>
            <p className="lead">I can help with your insurance questions. Take your time.</p>
            {scenarios.map((s) => (
              <button key={s.id} className="big" onClick={() => { setScenarioId(s.id); setRunNo(1); }}>{SIMPLE_LABELS[s.id] || s.user_message}</button>
            ))}
            <TalkToPerson />
            <div className="sizes"><span>Text size</span>
              {SIZES.map((s, i) => <button key={s} aria-label={`Text size ${i + 1}`} style={{ fontSize: 16 + i * 6 }} onClick={() => setScale(s)}>A</button>)}
            </div>
            <p className="small">Demo with made-up data. Not real insurance advice. You are watching recorded conversations, not a live chat.</p>
          </>
        ) : (
          <>
            <p className="small">Recorded conversation {runNo} of {maxRuns}</p>
            <p className="tag">You said:</p>
            <div className="bubble you">{sc.user_message}</div>
            <p className="tag">Claims Helper said:</p>
            <div className="bubble">{run ? run.reply || "(no reply recorded)" : "No recording for this one yet."}</div>
            <div className="safe"><strong>Stay safe.</strong> Never share a code that was sent to your phone. We will never ask for it.</div>
            <button className="big" onClick={() => setRunNo(runNo % maxRuns + 1)}>Show another recording</button>
            <button className="big ghost" onClick={() => setMode("hood")}>See what happened behind the scenes</button>
            <button className="big ghost" onClick={() => setScenarioId(null)}>Start over</button>
            <TalkToPerson />
            <p className="small">The same question can get a different answer each time. That is why every test here was run {maxRuns} times.</p>
          </>
        )}
      </main>
    );
  }

  // Under the hood
  const sid = scenarioId || scenarios[0].id;
  const sc = scenarios.find((s) => s.id === sid);
  const run = runFor(sid, activeVersion, runNo);
  return (
    <main className="app wide">
      {header}
      {report.seed && <div className="note"><strong>Sample data.</strong> These numbers come from the first test run, with replies cut to 200 characters. The full export replaces this file.</div>}
      <div className="row">
        <select aria-label="Scenario" value={sid} onChange={(e) => { setScenarioId(e.target.value); setRunNo(1); }}>
          {scenarios.map((s) => <option key={s.id} value={s.id}>{s.id}</option>)}
        </select>
        {versions.map((v) => <button key={v} className={"chip " + (activeVersion === v ? "on" : "")} onClick={() => setVersion(v)}>Prompt {v}</button>)}
        {[1, 2, 3, 4, 5].map((n) => <button key={n} className={"chip " + (runNo === n ? "on" : "")} onClick={() => setRunNo(n)}>Run {n}</button>)}
      </div>
      <Trace sc={sc} run={run} version={activeVersion} report={report} />
      <Dashboard report={report} runs={runs} version={activeVersion} versions={versions} />
      <p className="small">Model: {report.model}. Knowledge base: {report.knowledge_base}. Recorded replay, not live.</p>
    </main>
  );
}

function TalkToPerson() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="big ghost" onClick={() => setOpen(!open)}>Talk to a person</button>
      {open && <div className="safe">In the real product this would connect you to a person. This demo only replays recordings, so nobody will pick up.</div>}
    </>
  );
}

function Step({ n, title, detail, status, cls }) {
  return (
    <div className="step">
      <div className="num">{n}</div>
      <div className="body"><div className="t">{title}</div><div className="d">{detail}</div></div>
      <div className={"badge " + cls}>{status}</div>
    </div>
  );
}

function Trace({ sc, run, version, report }) {
  if (!run) return <div className="card">No recording for this run.</div>;
  const c = run.checks || {};
  const counts = report.versions[version].per_scenario[sc.id];
  const toolText = run.tools.length
    ? run.tools.map((t, i) => `${t}(${JSON.stringify(run.args[i] ?? {})})`).join(", ")
    : "No tool called.";
  const esc = sc.expected_action === "escalate";
  const escText = run.forced_by_rule ? "Handoff forced by a code rule (v2 guard)." : c.handed_off ? "The model chose to hand off." : "No handoff.";
  const replyOk = !c.false_claim && !c.wrong_language;
  const replyIssues = [c.false_claim && "claims an action it did not take", c.wrong_language && "wrong language"].filter(Boolean);
  return (
    <>
      <div>
        <h2>Run trace</h2>
        <p className="small">Scenario {sc.id}: expected “{sc.expected_action}”. {sc.notes}</p>
      </div>
      <div className="card"><strong className={run.passed ? "pass" : "fail"}>{run.passed ? "PASS" : "FAIL"}</strong>{!run.passed && run.cause ? ` (cause: ${run.cause})` : ""}</div>
      <Step n={1} title="Message in" detail={sc.user_message} status="INPUT" cls="mid" />
      <Step n={2} title="Tools called" detail={toolText + (c.ungrounded_call ? " Used an input the customer never gave." : "")} status={c.ungrounded_call ? "FAIL" : "PASS"} cls={c.ungrounded_call ? "fail" : "pass"} />
      <Step n={3} title="Escalation" detail={escText} status={esc ? (c.handed_off ? "PASS" : "FAIL") : c.handed_off ? "REVIEW" : "PASS"} cls={esc ? (c.handed_off ? "pass" : "fail") : c.handed_off ? "mid" : "pass"} />
      <Step n={4} title="Reply checks" detail={`Reading grade ${run.reading_grade}. Jargon words: ${run.jargon.length}. Questions asked: ${run.questions}.${replyIssues.length ? " Problem: " + replyIssues.join(", ") + "." : ""}`} status={replyOk ? "PASS" : "FAIL"} cls={replyOk ? "pass" : "fail"} />
      <Step n={5} title="Repeat runs" detail={`${counts.passed} of ${counts.total} runs passed for this scenario and prompt version.`} status={`${counts.passed}/${counts.total}`} cls={counts.passed === counts.total ? "pass" : counts.passed === 0 ? "fail" : "mid"} />
    </>
  );
}

const pct = (x) => (x == null ? "n/a" : `${x}%`);

function Dashboard({ report, runs, version, versions }) {
  const v = report.versions[version];
  const other = versions.find((x) => x !== version);
  const failEx = runs.filter((r) => r.version === version && !r.passed).slice(0, 3);
  return (
    <>
      <h2>Eval dashboard</h2>
      <div className="kpis">
        <div className="card"><div className="kpi">{Math.round(v.pass_rate * 100)}%</div><div className="small">Runs passed, prompt {version} ({v.passed}/{v.total})</div></div>
        <div className="card"><div className="kpi">{Math.round(report.earlier_eval.escalation_accuracy * 100)}%</div><div className="small">Escalation, earlier {report.earlier_eval.cases}-case test</div></div>
        <div className="card"><div className="kpi">{Math.round(report.earlier_eval.tool_accuracy * 100)}%</div><div className="small">Tool choice, earlier {report.earlier_eval.cases}-case test</div></div>
      </div>
      <div className="card">
        <strong>Pass rate by scenario</strong>
        <table><thead><tr><th>Scenario</th>{versions.map((x) => <th key={x}>{x}</th>)}</tr></thead>
          <tbody>{report.scenarios.map((s) => (
            <tr key={s.id}><td>{s.id}</td>{versions.map((x) => { const p = report.versions[x].per_scenario[s.id]; return <td key={x}>{p.passed}/{p.total}</td>; })}</tr>
          ))}</tbody></table>
        {!other && <p className="small" style={{ marginTop: 8 }}>Prompt v2 has not been run yet.</p>}
      </div>
      <div className="card">
        <strong>Why runs failed (prompt {version})</strong>
        {Object.keys(v.failures_by_cause).length === 0 ? <p className="small">No failures.</p> :
          Object.entries(v.failures_by_cause).map(([k, n]) => (
            <div key={k} style={{ marginTop: 8 }}><div className="small">{k}: {n}</div><div className="bar"><span style={{ width: `${(n / v.total) * 100}%`, background: "#FF8A80" }} /></div></div>
          ))}
        <p className="small" style={{ marginTop: 8 }}>prompt = wording or instructions. tool = wrong or invented tool input. code = no hard rule in the program.</p>
      </div>
      <div className="card" style={{ lineHeight: 1.7, fontSize: ".9rem" }}>
        <strong>Older-user checks (prompt {version})</strong><br />
        Reading grade 8 or lower: {pct(v.older_user_checks.reading_grade_8_or_lower)}<br />
        No jargon words: {pct(v.older_user_checks.no_jargon)}<br />
        One question or fewer per reply: {pct(v.older_user_checks.one_question_or_fewer)}<br />
        Handoff on the scam message: {pct(v.older_user_checks.handoff_on_scam)}
      </div>
      {failEx.length > 0 && <div className="card"><strong>Example failures</strong>
        {failEx.map((r, i) => <div key={i} className="fail-ex"><b>{r.scenario_id} run {r.run_no}</b> ({r.cause}): {r.reply.slice(0, 160)}…</div>)}</div>}
    </>
  );
}
