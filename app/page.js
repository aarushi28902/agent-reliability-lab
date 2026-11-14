"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { answer, buildIndex } from "./lib/brain";
import DOCS from "./lib/docs.json";

const SIZES = [1, 1.15, 1.3];
const SUGGESTIONS = ["What documents do I need after a car accident?", "How long does a claim take?", "What is an excess?", "Status of claim 5678"];
const HELLO = "Hello! Ask me anything about claims, documents, payments or staying safe. Take your time.";
const LABELS = { documents: "DOCUMENTS", tool: "TOOL", clarify: "ASKED", refused: "OUT OF SCOPE", handoff: "HAND-OFF", greeting: "GREETING" };

function useReport() {
  const [data, setData] = useState(null);
  useEffect(() => {
    Promise.all([fetch("/data/report.json").then((r) => r.json()), fetch("/data/runs.json").then((r) => r.json())])
      .then(([report, runs]) => setData({ report, runs }))
      .catch(() => setData(null));
  }, []);
  return data;
}

export default function Page() {
  const data = useReport();
  const index = useMemo(() => buildIndex(DOCS), []);
  const [mode, setMode] = useState("simple"); // simple | hood
  const [tab, setTab] = useState("chat"); // inside hood: chat | results
  const [scale, setScale] = useState(1);
  const [messages, setMessages] = useState([{ role: "bot", text: HELLO }]);
  const [showSugs, setShowSugs] = useState(true);
  const [noteOpen, setNoteOpen] = useState(true);
  const [scenarioId, setScenarioId] = useState(null);
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

  function ask(text) {
    text = text.trim();
    if (!text) return;
    setShowSugs(false);
    const r = answer(index, text);
    setMessages((m) => [...m, { role: "you", text }, { role: "bot", text: r.reply, r }]);
  }

  const header = (
    <div className="pill" role="tablist" aria-label="View">
      <button role="tab" aria-selected={mode === "simple"} className={mode === "simple" ? "on" : ""} onClick={() => setMode("simple")}>Simple</button>
      <button role="tab" aria-selected={mode === "hood"} className={mode === "hood" ? "on" : ""} onClick={() => setMode("hood")}>Under the hood</button>
    </div>
  );

  const chat = (
    <main className="app chatapp">
      {header}
      {mode === "hood" && (
        <div className="row" role="tablist" aria-label="Under the hood sections">
          <button className={"chip " + (tab === "chat" ? "on" : "")} onClick={() => setTab("chat")}>Chat internals</button>
          <button className={"chip " + (tab === "results" ? "on" : "")} onClick={() => setTab("results")}>Test results</button>
        </div>
      )}
      <div className="top"><h1>Claims Helper</h1><span className="chip">Answers from documents</span></div>
      {noteOpen && (
        <div className="note2"><span><b>Demo.</b> Made-up documents, not real advice. This version quotes from documents. A live AI is planned for when free quota allows.</span>
          <button type="button" aria-label="Hide note" onClick={() => setNoteOpen(false)}>&times;</button></div>
      )}
      <ChatLog messages={messages} hood={mode === "hood"} />
      {showSugs && (
        <div className="sugs">{SUGGESTIONS.map((t) => <button key={t} type="button" onClick={() => ask(t)}>{t}</button>)}</div>
      )}
      <ChatInput onSend={ask} />
      <div className="foot">
        <button type="button" onClick={() => ask("I want to talk to a person")}>Talk to a person</button>
        <span className="sizes">{SIZES.map((s, i) => <button key={s} aria-label={`Text size ${i + 1}`} style={{ fontSize: 14 + i * 4.5 }} onClick={() => setScale(s)}>A</button>)}</span>
      </div>
    </main>
  );

  if (mode === "simple" || tab === "chat") return chat;

  // Under the hood > Test results
  const versions = data ? Object.keys(data.report.versions).sort() : [];
  const activeVersion = version || (versions.includes("v2") ? "v2" : versions[0]);
  return (
    <main className="app wide">
      {header}
      <div className="row" role="tablist" aria-label="Under the hood sections">
        <button className={"chip " + (tab === "chat" ? "on" : "")} onClick={() => setTab("chat")}>Chat internals</button>
        <button className={"chip " + (tab === "results" ? "on" : "")} onClick={() => setTab("results")}>Test results</button>
      </div>
      {!data ? <p className="lead">Loading…</p> : <Results data={data} versions={versions} activeVersion={activeVersion} setVersion={setVersion}
        scenarioId={scenarioId} setScenarioId={setScenarioId} runNo={runNo} setRunNo={setRunNo} />}
    </main>
  );
}

function ChatLog({ messages, hood }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [messages]);
  return (
    <div id="log" ref={ref} aria-live="polite">
      {messages.map((m, i) => (
        <div key={i} className={"msg " + (m.role === "you" ? "you " : "") + (m.r && m.r.layer === "refused" ? "refused " : "") + (m.r && m.r.layer === "handoff" ? "handoff" : "")}>
          {m.text}
          {m.r && m.r.source && <div className="src">From: {m.r.source}</div>}
          {m.r && hood && (
            <div className="hoodbox">
              <div><span className={"b " + (m.r.layer === "refused" || m.r.layer === "handoff" ? "warn" : "ok")}>{LABELS[m.r.layer]}</span>layer used</div>
              {m.r.steps.map((s, j) => <div className="step2" key={j}><span className={s[2]}>{s[0]}:</span> {s[1]}</div>)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ChatInput({ onSend }) {
  const [v, setV] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSend(v); setV(""); }}>
      <input value={v} onChange={(e) => setV(e.target.value)} autoComplete="off" placeholder="Type your question here" aria-label="Your question" />
      <button className="send" type="submit">Send</button>
    </form>
  );
}

function Results({ data, versions, activeVersion, setVersion, scenarioId, setScenarioId, runNo, setRunNo }) {
  const { report, runs } = data;
  const scenarios = report.scenarios;
  const sid = scenarioId || scenarios[0].id;
  const sc = scenarios.find((s) => s.id === sid);
  const run = runs.find((r) => r.scenario_id === sid && r.version === activeVersion && r.run_no === runNo);
  return (
    <>
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
      <p className="small">Model: {report.model}. Knowledge base: {report.knowledge_base}. Recorded results, not live.</p>
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
      <div className="card"><div className="small">Reply recorded in this run</div><div style={{ marginTop: 6, fontSize: ".9rem", lineHeight: 1.5 }}>{run.reply || "(empty)"}</div></div>
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
