const DATA_URL = "kids-quest-data.json";
const STORAGE_KEY = "kidsQuest.v2";

// Remote JSON store (Option 3: shared data across devices on a static host like GitHub Pages).
// 1. Create a free account at https://jsonbin.io
// 2. Create a bin, paste the contents of kids-quest-data.json into it, save.
// 3. Copy your bin ID and API key (X-Access-Key or X-Master-Key) here.
const REMOTE_URL = "https://api.jsonbin.io/v3/b/6ab86189ffd5d1605332e50c"
const REMOTE_KEY = "$2a$10$lL2ynmQYCZTDBo4jXQV.ne47EB5xvquZjYQpAcr4BCfNeMgEOzE6a"; // your JSONBin X-Access-Key
const remoteHeaders = (extra={}) => ({ ...extra, "X-Access-Key": REMOTE_KEY, "X-Master-Key": REMOTE_KEY });
const remoteEnabled = () => !!REMOTE_URL;

const defaultTasks = [
  { id: "t1", name: "Ukelele practice", description: "Practice for 30 minutes", points: 10, emoji: "🎵", active: true },
  { id: "t2", name: "Help parent", description: "Help with one family task", points: 5, emoji: "💛", active: true },
  { id: "t3", name: "Read a book", description: "Read for 20 minutes", points: 8, emoji: "📚", active: true },
  { id: "t4", name: "Tidy up", description: "Put toys and things back", points: 6, emoji: "🧸", active: true }
];
const defaultRewards = [
  { id: "r1", name: "Ice cream", description: "Choose your favorite flavor", points: 50, emoji: "🍦", active: true },
  { id: "r2", name: "Game time", description: "30 extra minutes", points: 100, emoji: "🎮", active: true },
  { id: "r3", name: "Small toy", description: "Pick a small surprise", points: 250, emoji: "🧸", active: true },
  { id: "r4", name: "Family outing", description: "Choose a fun family activity", points: 500, emoji: "🌈", active: true }
];

const defaultState = {
  parent: { code: "910430" },
  kids: [
    {
      id: "k1",
      name: "Little Hero",
      avatar: "🧒",
      password: "",
      points: 125,
      tasks: structuredClone(defaultTasks),
      rewards: structuredClone(defaultRewards),
      completions: [],
      redemptions: []
    }
  ]
};

let state = structuredClone(defaultState);
let mode = "profiles"; // "profiles" | "kid" | "parent"
let currentKidId = null;
let parentKidId = null;
let parentTab = "approvals";
let questFilter = "notdone"; // "notdone" | "done" | "all"
let statsRange = 30; // days; 0 = all time

// Normalize old single-kid format and fill missing fields.
function normalize(data) {
  if (!data || typeof data !== "object") return structuredClone(defaultState);
  if (!Array.isArray(data.kids)) {
    data = {
      parent: data.parent || { code: "910430" },
      kids: [{
        id: uid("k_"),
        name: data.kid?.name || "Little Hero",
        points: data.kid?.points || 0,
        tasks: data.tasks || [],
        rewards: data.rewards || [],
        completions: data.completions || [],
        redemptions: data.redemptions || []
      }]
    };
  }
  data.parent ||= { code: "910430" };
  data.parent.code ||= "910430";
  data.kids.forEach(k => {
    k.id ||= uid("k_");
    k.name ||= "Kid";
    k.avatar ||= "🧒";
    k.password ??= "";
    k.points ??= 0;
    k.tasks ||= [];
    k.tasks.forEach(t => {
      t.type ||= "single";       // "single" | "multiple" (multi-submit)
      t.interval ||= 1;          // days between occurrences
      t.nextDate ??= null;       // next date this quest appears
    });
    k.rewards ||= [];
    k.completions ||= [];
    k.redemptions ||= [];
  });
  if (!data.kids.length) data = structuredClone(defaultState);
  return data;
}

function saveState() {
  const body = JSON.stringify(state, null, 2);
  localStorage.setItem(STORAGE_KEY, body);
  if (remoteEnabled()) {
    fetch(REMOTE_URL, {
      method: "PUT",
      headers: remoteHeaders({ "Content-Type": "application/json", "X-Bin-Versioning": "false" }),
      body
    }).catch(() => {});
    return;
  }
  // Persist back to the server-hosted JSON file (PUT, then POST fallback).
  fetch(DATA_URL, { method: "PUT", headers: { "Content-Type": "application/json" }, body })
    .then(r => { if (!r.ok) throw new Error(r.status); })
    .catch(() => fetch(DATA_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body }).catch(() => {}));
}

function kid() {
  return state.kids.find(k => k.id === currentKidId) || state.kids[0];
}
function parentKid() {
  return state.kids.find(k => k.id === parentKidId) || state.kids[0];
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
function dateLabel() {
  return new Date().toLocaleDateString(undefined, { weekday:"long", month:"short", day:"numeric" });
}
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
function uid(prefix) { return prefix + Math.random().toString(36).slice(2, 9); }
function fmt(n) { return (n < 0 ? "−" : "+") + Math.abs(n); }

function completionFor(taskId, date=today()) {
  const cs = kid().completions.filter(c => c.taskId === taskId && c.date === date);
  return cs.find(c => c.status === "pending") || cs[cs.length - 1];
}
function taskStats(taskId, date=today()) {
  const cs = kid().completions.filter(c => c.taskId === taskId && c.date === date);
  return {
    approved: cs.reduce((s, c) => s + (c.status === "approved" ? (c.approved || 1) : 0), 0),
    rejected: cs.filter(c => c.status === "rejected").length
  };
}
function addDays(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function isDue(t, date=today()) {
  return !t.nextDate || t.nextDate <= date;
}
function intervalLabel(t) {
  const map = {1:"Daily", 7:"Weekly", 14:"Biweekly", 21:"Every 3 weeks", 30:"Monthly"};
  return map[t.interval] || `Every ${t.interval} days`;
}
function render() {
  const el = document.getElementById("app");
  const warn = dataWarning ? `<div class="card data-warning">${dataWarning}</div>` : "";
  el.innerHTML = warn + (mode === "kid" ? kidView() : mode === "parent" ? parentView() : profilesView());
}
function profilesView() {
  return `
    <section class="hero">
      <div>
        <h1>Who's playing? 🌟</h1>
        <p>Pick your profile to start your quests!</p>
      </div>
      <div class="hero-mascot">🐰</div>
    </section>
    <div class="profile-grid">
      ${state.kids.map(k => `
        <button class="card profile-card" onclick="selectKid('${k.id}')">
          ${k.password ? '<span class="profile-lock">🔒</span>' : ""}
          <span class="profile-avatar">${esc(k.avatar || "🧒")}</span>
          <strong>${esc(k.name)}</strong>
          <small>⭐ ${k.points}</small>
        </button>`).join("")}
    </div>
  `;
}
function selectKid(id) {
  const k = state.kids.find(x => x.id === id);
  if (!k) return;
  if (k.password) {
    const p = prompt(`Password for ${k.name}:`);
    if (p === null) return;
    if (p !== k.password) return alert("Wrong password.");
  }
  currentKidId = id;
  mode = "kid";
  render();
}
function kidView() {
  const k = kid();
  const isDone = t => t.type !== "multiple" && completionFor(t.id)?.status === "approved";
  let tasks = k.tasks.filter(t => t.active && isDue(t)).sort((a, b) => b.points - a.points);
  if (questFilter === "notdone") tasks = tasks.filter(t => !isDone(t));
  if (questFilter === "done") tasks = tasks.filter(isDone);
  const upcoming = k.tasks.filter(t => t.active && !isDue(t)).sort((a, b) => (a.nextDate || "9999").localeCompare(b.nextDate || "9999"));
  const rewards = k.rewards.filter(r => r.active);
  const earned = k.points;
  return `
    <section class="hero">
      <div>
        <h1>Hi, ${esc(k.name)}! 🌟</h1>
        <p>Ready for today's little quests?</p>
      </div>
      <div class="hero-mascot">🐰</div>
      <div class="points-card"><span class="big">⭐ ${earned}</span><small>your points</small><button class="text-btn" onclick="mode='profiles';render()">Switch kid</button></div>
    </section>

    <div class="section-head">
      <h2>Today's Quests 🗺️</h2>
      <span class="date-pill">${dateLabel()}</span>
    </div>
    <div class="filter-row">
      ${[["notdone","Not done"],["done","Done ✓"],["all","All"]].map(([v,l]) =>
        `<button class="tab ${questFilter===v?"active":""}" onclick="questFilter='${v}';render()">${l}</button>`).join("")}
    </div>

    <div class="task-grid">
      ${tasks.length ? tasks.map(taskCard).join("") : empty("🪄","No quests today!")}
    </div>

    ${upcoming.length ? `
    <div class="section-head"><h2>Coming up 📅</h2><span class="date-pill">submit early if you like!</span></div>
    <div class="task-grid">
      ${upcoming.map(taskCard).join("")}
    </div>` : ""}

    <div class="section-head">
      <h2>🎁 Reward Shop</h2>
      <span class="date-pill">${rewards.length} rewards</span>
    </div>

    <div class="reward-grid">
      ${rewards.length ? rewards.map(rewardCard).join("") : empty("🎁","No rewards yet!")}
    </div>
  `;
}
function taskCard(t) {
  const c = completionFor(t.id);
  const multi = t.type === "multiple";
  const daily = (t.interval || 1) === 1;
  let button = `<button class="complete-btn" onclick="completeTask('${t.id}')">Done! ⭐</button>`;
  if (multi && c?.status === "pending")
    button = `<button class="complete-btn pending" onclick="completeTask('${t.id}')">Done ×${c.submits} — more! ⭐</button>`;
  else if (c?.status === "pending") button = `<button class="complete-btn pending" disabled>Waiting… ⏳</button>`;
  if (c?.status === "approved")
    button = daily
      ? (multi
          ? `<button class="complete-btn" onclick="completeTask('${t.id}')">Done again! ⭐</button>`
          : `<button class="complete-btn approved" disabled>Approved ✓</button>`)
      : `<button class="complete-btn" onclick="completeTask('${t.id}')">Done! ⭐</button>`;
  if (c?.status === "rejected") button = `<button class="complete-btn" onclick="completeTask('${t.id}')">Try again</button>`;
  const st = taskStats(t.id);
  const showApproved = multi && st.approved > 0;
  const statLine = (showApproved || st.rejected)
    ? `<div class="task-desc">${showApproved ? `<span style="color:#23845d">✓ ${st.approved} approved</span>` : ""}${showApproved && st.rejected ? " · " : ""}${st.rejected ? `<span style="color:#d95667">✗ ${st.rejected} rejected</span>` : ""}</div>`
    : "";
  return `
    <article class="card task-card ${c?.status === "approved" ? "done" : ""}">
      <div class="task-icon">${esc(t.emoji)}</div>
      <div class="task-body">
        <div class="task-title">${esc(t.name)}${!daily && t.nextDate ? ` <small style="color:var(--muted);font-weight:700">· next ${esc(t.nextDate)}</small>` : ""}</div>
        <div class="task-desc">${esc(t.description)}</div>
        <div class="task-points" ${t.points < 0 ? 'style="color:#d95667"' : ""}>${fmt(t.points)} ⭐${multi ? " each" : ""}</div>
        ${statLine}
        ${c?.status === "rejected" ? `<div class="task-desc" style="color:#d95667">Parent asked you to try again.</div>` : ""}
      </div>
      <div class="task-action">${button}</div>
    </article>
  `;
}
function rewardCard(r) {
  const can = kid().points >= r.points;
  const pct = Math.min(100, Math.round((kid().points / r.points) * 100));
  return `
    <article class="card reward-card">
      <div class="reward-emoji">${esc(r.emoji)}</div>
      <h3>${esc(r.name)}</h3>
      <div class="task-desc">${esc(r.description)}</div>
      <div class="reward-cost">${r.points} ⭐</div>
      <div class="progress-wrap">
        <div class="progress-label"><span>${kid().points} / ${r.points}</span><span>${pct}%</span></div>
        <div class="progress"><span style="width:${pct}%"></span></div>
      </div>
      <button class="primary redeem-btn" ${can ? "" : "disabled"} onclick="redeem('${r.id}')">${can ? "Exchange 🎁" : "Need more stars"}</button>
    </article>
  `;
}
function empty(emoji, text) {
  return `<div class="card empty"><span class="emoji">${emoji}</span>${text}</div>`;
}

function parentView() {
  const pk = parentKid();
  const pending = pk.completions.filter(c => c.date === today() && c.status === "pending");
  return `
    <section class="hero">
      <div>
        <h1>Parent HQ 🏡</h1>
        <p>Guide quests, approve wins, manage rewards.</p>
      </div>
      <div class="hero-mascot">🦊</div>
      <div class="points-card"><span class="big">⭐ ${pk.points}</span><small>${esc(pk.name)}'s points</small></div>
    </section>

    <div class="section-head">
      <div class="tabs">
        ${state.kids.map(k => `<button class="tab ${pk.id===k.id?"active":""}" onclick="parentKidId='${k.id}';render()">${esc(k.avatar||"🧒")} ${esc(k.name)}</button>`).join("")}
      </div>
    </div>

    <div class="section-head">
      <div class="tabs">
        <button class="tab ${parentTab==="approvals"?"active":""}" onclick="setTab('approvals')">Approvals</button>
        <button class="tab ${parentTab==="tasks"?"active":""}" onclick="setTab('tasks')">Tasks</button>
        <button class="tab ${parentTab==="rewards"?"active":""}" onclick="setTab('rewards')">Rewards</button>
        <button class="tab ${parentTab==="points"?"active":""}" onclick="setTab('points')">Points</button>
        <button class="tab ${parentTab==="stats"?"active":""}" onclick="setTab('stats')">Stats</button>
        <button class="tab ${parentTab==="kids"?"active":""}" onclick="setTab('kids')">Kids</button>
      </div>
    </div>

    ${parentTab === "approvals" ? approvalsView(pending) : ""}
    ${parentTab === "tasks" ? tasksAdminView() : ""}
    ${parentTab === "rewards" ? rewardsAdminView() : ""}
    ${parentTab === "points" ? pointsAdminView() : ""}
    ${parentTab === "stats" ? statsView() : ""}
    ${parentTab === "kids" ? kidsAdminView() : ""}
  `;
}
function approvalsView(pending) {
  const pk = parentKid();
  const recent = pk.completions.filter(c => c.date === today()).slice().reverse();
  return `
    <div class="section-head"><h2>Waiting for you 💌</h2><span class="date-pill">${pending.length} pending</span></div>
    ${pending.length ? `<div class="admin-grid">${pending.map(c => {
      const t = pk.tasks.find(x => x.id === c.taskId);
      return `<article class="card pending-card">
        <div style="font-size:32px">${esc(t?.emoji || "⭐")}</div>
        <h3 style="font:800 21px 'Baloo 2';margin:5px 0">${esc(t?.name || "Task")}</h3>
        <div class="pending-meta">${dateLabel()} · ${fmt(c.points)} ⭐${(c.submits || 1) > 1 ? ` · <strong>×${c.submits} submits</strong>` : ""}</div>
        <div class="pending-actions">
          <button class="primary" onclick="approve('${c.id}')">Approve ✓</button>
          <button class="danger" onclick="reject('${c.id}')">Try again</button>
        </div>
      </article>`;
    }).join("")}</div>` : empty("🎉","All caught up! No tasks waiting for approval.")}
    <div class="section-head"><h2>Today's activity</h2></div>
    <div class="card admin-card">
      ${recent.length ? recent.map(c => {
        const t = pk.tasks.find(x => x.id === c.taskId);
        return `<div class="admin-row">
          <div class="admin-info"><strong>${esc(t?.emoji || "⭐")} ${esc(t?.name || "Task")}</strong><small>${fmt(c.points)} ⭐${(c.submits||1)>1?" ×"+c.submits:""} · ${esc(c.status)}${c.approved>1?" (×"+c.approved+")":""}</small></div>
          <div class="actions">${c.status === "pending" ? `<button class="primary" onclick="approve('${c.id}')">Approve</button>` : ""}</div>
        </div>`;
      }).join("") : `<div class="empty">No activity yet today.</div>`}
    </div>
  `;
}
function tasksAdminView() {
  return `
    <div class="section-head"><h2>Manage Quests</h2><button class="primary" onclick="openTaskModal()">＋ Add task</button></div>
    <div class="card admin-card">
      ${parentKid().tasks.slice().sort((a, b) => b.points - a.points).map(t => `<div class="admin-row">
        <div class="admin-info"><strong>${esc(t.emoji)} ${esc(t.name)}</strong><small>${esc(t.description)} · ${fmt(t.points)} ⭐ · ${intervalLabel(t)}${t.type==="multiple"?" · multi-submit":""}${t.nextDate?" · next "+esc(t.nextDate):""}</small></div>
        <div class="actions">
          <button class="ghost" onclick="openTaskModal('${t.id}')">Edit</button>
          <button class="danger" onclick="deleteTask('${t.id}')">Delete</button>
        </div>
      </div>`).join("")}
    </div>
  `;
}
function rewardsAdminView() {
  return `
    <div class="section-head"><h2>Manage Rewards</h2><button class="primary" onclick="openRewardModal()">＋ Add reward</button></div>
    <div class="card admin-card">
      ${parentKid().rewards.map(r => `<div class="admin-row">
        <div class="admin-info"><strong>${esc(r.emoji)} ${esc(r.name)}</strong><small>${esc(r.description)} · ${r.points} ⭐</small></div>
        <div class="actions">
          <button class="ghost" onclick="openRewardModal('${r.id}')">Edit</button>
          <button class="danger" onclick="deleteReward('${r.id}')">Delete</button>
        </div>
      </div>`).join("")}
    </div>
  `;
}
function pointsAdminView() {
  const pk = parentKid();
  return `
    <div class="card">
      <h2 style="font:800 26px 'Baloo 2';margin-top:0">⭐ ${esc(pk.name)}'s points</h2>
      <p style="color:var(--muted);font-weight:700">Current balance: <strong>${pk.points}</strong> stars.</p>
      <button class="primary" onclick="editPoints()">Adjust points</button>
      <div class="notice">Tip: use this for bonus stars, corrections, or subtracting points after a manual reward exchange.</div>
    </div>
  `;
}
const STATS_RANGES = [[7,"7 days"],[30,"1 month"],[90,"3 months"],[365,"1 year"],[0,"All time"]];
function statsView() {
  const pk = parentKid();
  const since = statsRange ? addDays(today(), -(statsRange - 1)) : "0000-00-00";
  const cs = pk.completions.filter(c => c.date >= since);
  const approved = cs.filter(c => c.status === "approved");
  const earned = approved.reduce((s, c) => s + c.points * (c.approved || 1), 0);
  const submits = cs.reduce((s, c) => s + (c.submits || 1), 0);
  const reds = pk.redemptions.filter(r => r.date >= since);
  const spent = reds.reduce((s, r) => s + r.points, 0);
  const perTask = pk.tasks.map(t => {
    const tcs = cs.filter(c => c.taskId === t.id);
    if (!tcs.length) return null;
    return { t,
      lastDate: tcs.reduce((m, c) => c.date > m ? c.date : m, ""),
      submits: tcs.reduce((s, c) => s + (c.submits || 1), 0),
      approved: tcs.reduce((s, c) => s + (c.status === "approved" ? (c.approved || 1) : 0), 0),
      rejected: tcs.filter(c => c.status === "rejected").length,
      earned: tcs.reduce((s, c) => s + (c.status === "approved" ? c.points * (c.approved || 1) : 0), 0) };
  }).filter(Boolean).sort((a, b) => b.earned - a.earned);
  const perReward = reds.map(r => {
    const rw = pk.rewards.find(x => x.id === r.rewardId);
    return { name: rw ? `${rw.emoji} ${rw.name}` : "Reward", date: r.date, points: r.points };
  }).reverse();
  const stat = (label, value, color) => `<div class="card" style="text-align:center;padding:14px">
    <div style="font:800 26px 'Baloo 2';color:${color}">${value}</div>
    <div style="color:var(--muted);font-weight:800;font-size:13px">${label}</div></div>`;
  return `
    <div class="section-head"><h2>Statistics 📊</h2>
      <div class="filter-row" style="margin:0">
        ${STATS_RANGES.map(([d,l]) => `<button class="tab ${statsRange===d?"active":""}" onclick="statsRange=${d};render()">${l}</button>`).join("")}
      </div>
    </div>
    <div class="admin-grid" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr))">
      ${stat("⭐ earned", earned, "#e8920c")}
      ${stat("submits", submits, "var(--purple-dark)")}
      ${stat("✓ approved", approved.reduce((s,c)=>s+(c.approved||1),0), "#23845d")}
      ${stat("✗ rejected", cs.filter(c=>c.status==="rejected").length, "#d95667")}
      ${stat("🎁 spent", spent, "var(--pink)")}
    </div>
    <div class="section-head"><h2>By quest</h2></div>
    <div class="card admin-card">
      ${perTask.length ? perTask.map(r => `<div class="admin-row">
        <div class="admin-info"><strong>${esc(r.t.emoji)} ${esc(r.t.name)}</strong>
        <small>${esc(r.lastDate)} · ${r.submits} submits · <span style="color:#23845d">✓ ${r.approved}</span> · <span style="color:#d95667">✗ ${r.rejected}</span></small></div>
        <strong style="color:${r.earned<0?"#d95667":"#e8920c"}">${fmt(r.earned)} ⭐</strong>
      </div>`).join("") : `<div class="empty">No activity in this range.</div>`}
    </div>
    ${perReward.length ? `<div class="section-head"><h2>Rewards redeemed</h2></div>
    <div class="card admin-card">
      ${perReward.map(r => `<div class="admin-row">
        <div class="admin-info"><strong>${esc(r.name)}</strong><small>${esc(r.date)}</small></div>
        <strong style="color:var(--pink)">−${r.points} ⭐</strong>
      </div>`).join("")}
    </div>` : ""}
    <div class="section-head"><h2>Clear history 🧹</h2><span class="date-pill">points balance is kept</span></div>
    <div class="filter-row" style="margin:0">
      ${[[1,"Today"],[7,"1 week"],[30,"1 month"],[0,"All time"]].map(([d,l]) =>
        `<button class="tab" onclick="clearHistory(${d})">${l}</button>`).join("")}
    </div>
  `;
}
function clearHistory(days) {
  const pk = parentKid();
  const since = days ? addDays(today(), -(days - 1)) : "0000-00-00";
  const n = pk.completions.filter(c => c.date >= since).length
          + pk.redemptions.filter(r => r.date >= since).length;
  if (!n) return alert("Nothing to clear in this range.");
  if (!confirm(`Delete ${n} history record(s)${days ? "" : " (all time)"}? Points already earned are kept.`)) return;
  pk.completions = pk.completions.filter(c => c.date < since);
  pk.redemptions = pk.redemptions.filter(r => r.date < since);
  saveState(); render();
}
function kidsAdminView() {
  return `
    <div class="section-head"><h2>Kid Profiles</h2><button class="primary" onclick="openKidModal()">＋ Add kid</button></div>
    <div class="card admin-card">
      ${state.kids.map(k => `<div class="admin-row">
        <div class="admin-info"><strong>${esc(k.avatar||"🧒")} ${esc(k.name)}</strong><small>⭐ ${k.points} · ${k.password ? "🔒 password set" : "no password"}</small></div>
        <div class="actions">
          <button class="ghost" onclick="openKidModal('${k.id}')">Edit</button>
          <button class="danger" onclick="deleteKid('${k.id}')">Delete</button>
        </div>
      </div>`).join("")}
    </div>
    <div class="section-head"><h2>Parent settings</h2></div>
    <div class="card admin-card">
      <div class="admin-row">
        <div class="admin-info"><strong>🔑 Parent code</strong><small>Used to enter Parent HQ</small></div>
        <div class="actions"><button class="ghost" onclick="editParentCode()">Change</button></div>
      </div>
    </div>
  `;
}

function completeTask(id) {
  const k = kid();
  const t = k.tasks.find(x => x.id === id);
  if (!t) return;
  const pend = k.completions.find(c => c.taskId === id && c.date === today() && c.status === "pending");
  if (pend) {
    if (t.type !== "multiple") return;
    pend.submits = (pend.submits || 1) + 1;   // each click = one more submit
  } else {
    // New submit: first time, after rejection, or done again after approval.
    // Keep the old approved/rejected record so stats stay accurate.
    k.completions.push({ id: uid("c_"), taskId:id, date:today(), status:"pending", points:t.points, submits:1 });
  }
  saveState(); render();
}
function approve(cid) {
  const pk = parentKid();
  const c = pk.completions.find(x => x.id === cid);
  if (!c || c.status !== "pending") return;
  const t = pk.tasks.find(x => x.id === c.taskId);
  const submits = c.submits || 1;
  let count = submits;
  if (submits > 1) {
    const ans = prompt(`Kid submitted ×${submits}. Approve how many? (0-${submits})`, submits);
    if (ans === null) return;
    count = Math.max(0, Math.min(submits, parseInt(ans, 10) || 0));
  }
  if (count === 0) { c.status = "rejected"; saveState(); render(); return; }
  c.status = "approved";
  c.approved = count;
  pk.points += c.points * count;
  // Non-daily tasks: schedule next occurrence. If submitted early, advance from
  // the scheduled date; otherwise from the submission date.
  if (t && (t.interval || 1) > 1) {
    const base = t.nextDate && t.nextDate > c.date ? t.nextDate : c.date;
    t.nextDate = addDays(base, t.interval);
  }
  saveState(); render();
}
function reject(cid) {
  const pk = parentKid();
  const c = pk.completions.find(x => x.id === cid);
  if (!c || c.status !== "pending") return;
  c.status = "rejected";
  saveState(); render();
}
function redeem(id) {
  const k = kid();
  const r = k.rewards.find(x => x.id === id);
  if (!r || k.points < r.points) return;
  if (!confirm(`Exchange ${r.points} stars for "${r.name}"?`)) return;
  k.points -= r.points;
  k.redemptions.push({ id:uid("red_"), rewardId:id, date:today(), points:r.points });
  saveState(); render();
}
function setTab(tab) { parentTab = tab; render(); }

const REPEAT_OPTIONS = [1, 7, 14, 21, 30];
function openTaskModal(id) {
  const t = parentKid().tasks.find(x => x.id === id) || { name:"", description:"", points:10, emoji:"⭐", type:"single", interval:1 };
  const isCustom = !REPEAT_OPTIONS.includes(t.interval);
  showModal("Task", `
    <div class="form-row"><label>Name</label><input id="fName" value="${esc(t.name)}" maxlength="60"></div>
    <div class="form-row"><label>Description</label><input id="fDesc" value="${esc(t.description)}" maxlength="100"></div>
    <div class="form-row"><label>Points (negative = punishment)</label><input id="fPoints" type="number" value="${t.points}"></div>
    <div class="form-row"><label>Emoji</label><input id="fEmoji" value="${esc(t.emoji)}" maxlength="4"></div>
    <div class="form-row"><label>Type</label><select id="fType">
      <option value="single" ${t.type!=="multiple"?"selected":""}>Single — one submit per occurrence</option>
      <option value="multiple" ${t.type==="multiple"?"selected":""}>Multiple — kid can submit many times, parent approves N</option>
    </select></div>
    <div class="form-row"><label>Repeat</label><select id="fRepeat" onchange="document.getElementById('fCustomRow').style.display=this.value==='custom'?'':'none'">
      <option value="1" ${t.interval===1?"selected":""}>Today / daily</option>
      <option value="7" ${t.interval===7?"selected":""}>Weekly</option>
      <option value="14" ${t.interval===14?"selected":""}>Biweekly</option>
      <option value="21" ${t.interval===21?"selected":""}>Every 3 weeks</option>
      <option value="30" ${t.interval===30?"selected":""}>Monthly</option>
      <option value="custom" ${isCustom?"selected":""}>Custom…</option>
    </select></div>
    <div class="form-row" id="fCustomRow" style="display:${isCustom?'':'none'}"><label>Every N days</label><input id="fRepeatDays" type="number" min="2" value="${isCustom ? t.interval : 2}"></div>
    <div class="notice">Non-daily quests hide until their next date; after approval they re-appear automatically.</div>
    <div class="modal-actions"><button class="ghost" onclick="closeModal()">Cancel</button><button class="primary" onclick="saveTask('${id || ""}')">Save task</button></div>
  `);
}
function saveTask(id) {
  const name = val("fName"), description = val("fDesc"), emoji = val("fEmoji") || "⭐";
  const points = Math.trunc(Number(val("fPoints")) ?? 0) || 0;   // negative allowed = punishment
  if (!name) return alert("Please enter a task name.");
  const type = val("fType") === "multiple" ? "multiple" : "single";
  const rep = val("fRepeat");
  const interval = rep === "custom" ? Math.max(2, Number(val("fRepeatDays")) || 2) : Number(rep);
  const pk = parentKid();
  if (id) Object.assign(pk.tasks.find(x => x.id === id), {name,description,points,emoji,type,interval});
  else pk.tasks.push({id:uid("t_"),name,description,points,emoji,type,interval,nextDate:null,active:true});
  saveState(); closeModal(); render();
}
function deleteTask(id) {
  if (!confirm("Delete this task?")) return;
  const pk = parentKid();
  pk.tasks = pk.tasks.filter(t => t.id !== id);
  saveState(); render();
}
function openRewardModal(id) {
  const r = parentKid().rewards.find(x => x.id === id) || { name:"", description:"", points:50, emoji:"🎁" };
  showModal("Reward", `
    <div class="form-row"><label>Name</label><input id="fName" value="${esc(r.name)}" maxlength="60"></div>
    <div class="form-row"><label>Description</label><input id="fDesc" value="${esc(r.description)}" maxlength="100"></div>
    <div class="form-row"><label>Points required</label><input id="fPoints" type="number" min="1" value="${r.points}"></div>
    <div class="form-row"><label>Emoji</label><input id="fEmoji" value="${esc(r.emoji)}" maxlength="4"></div>
    <div class="modal-actions"><button class="ghost" onclick="closeModal()">Cancel</button><button class="primary" onclick="saveReward('${id || ""}')">Save reward</button></div>
  `);
}
function saveReward(id) {
  const name = val("fName"), description = val("fDesc"), points = Math.max(1, Number(val("fPoints")) || 1), emoji = val("fEmoji") || "🎁";
  if (!name) return alert("Please enter a reward name.");
  const pk = parentKid();
  if (id) Object.assign(pk.rewards.find(x => x.id === id), {name,description,points,emoji});
  else pk.rewards.push({id:uid("r_"),name,description,points,emoji,active:true});
  saveState(); closeModal(); render();
}
function deleteReward(id) {
  if (!confirm("Delete this reward?")) return;
  const pk = parentKid();
  pk.rewards = pk.rewards.filter(r => r.id !== id);
  saveState(); render();
}
function openKidModal(id) {
  const k = state.kids.find(x => x.id === id) || { name:"", avatar:"🧒", password:"" };
  showModal(id ? "Edit kid" : "Add kid", `
    <div class="form-row"><label>Name</label><input id="fName" value="${esc(k.name)}" maxlength="30"></div>
    <div class="form-row"><label>Avatar emoji</label><input id="fAvatar" value="${esc(k.avatar)}" maxlength="4"></div>
    <div class="form-row"><label>Profile password</label><input id="fPass" value="${esc(k.password)}" maxlength="20" placeholder="Leave empty for no password"></div>
    <div class="notice">Kids must enter this password to open their profile. Leave empty for open access.</div>
    <div class="modal-actions"><button class="ghost" onclick="closeModal()">Cancel</button><button class="primary" onclick="saveKid('${id || ""}')">Save</button></div>
  `);
}
function saveKid(id) {
  const name = val("fName"), avatar = val("fAvatar") || "🧒", password = val("fPass");
  if (!name) return alert("Please enter a name.");
  if (id) Object.assign(state.kids.find(x => x.id === id), {name, avatar, password});
  else state.kids.push({ id:uid("k_"), name, avatar, password, points:0,
    tasks: structuredClone(defaultTasks), rewards: structuredClone(defaultRewards), completions: [], redemptions: [] });
  saveState(); closeModal(); render();
}
function deleteKid(id) {
  if (state.kids.length <= 1) return alert("You need at least one kid profile.");
  const k = state.kids.find(x => x.id === id);
  if (!confirm(`Delete profile "${k?.name}" and all its data?`)) return;
  state.kids = state.kids.filter(x => x.id !== id);
  if (parentKidId === id) parentKidId = state.kids[0].id;
  if (currentKidId === id) { currentKidId = null; mode = "profiles"; }
  saveState(); render();
}
function editParentCode() {
  showModal("Parent code", `
    <div class="form-row"><label>New parent code</label><input id="fCode" value="${esc(state.parent.code)}" maxlength="20"></div>
    <div class="modal-actions"><button class="ghost" onclick="closeModal()">Cancel</button><button class="primary" onclick="saveParentCode()">Save</button></div>
  `);
}
function saveParentCode() {
  const code = val("fCode");
  if (!code) return alert("Please enter a code.");
  state.parent.code = code;
  saveState(); closeModal(); render();
}
function editPoints() {
  showModal("Adjust points", `
    <div class="form-row"><label>New point balance</label><input id="fPoints" type="number" min="0" value="${parentKid().points}"></div>
    <div class="notice">This directly changes the balance. Use positive or zero values only.</div>
    <div class="modal-actions"><button class="ghost" onclick="closeModal()">Cancel</button><button class="primary" onclick="savePoints()">Save</button></div>
  `);
}
function savePoints() {
  parentKid().points = Math.max(0, Number(val("fPoints")) || 0);
  saveState(); closeModal(); render();
}
function showModal(title, body) {
  document.getElementById("modalRoot").innerHTML = `<div class="modal-backdrop" onclick="if(event.target===this)closeModal()"><div class="modal"><h2>${title}</h2>${body}</div></div>`;
}
function closeModal() { document.getElementById("modalRoot").innerHTML = ""; }
function val(id) { return document.getElementById(id)?.value.trim() || ""; }

document.getElementById("parentToggle").onclick = () => {
  if (mode !== "parent") {
    const code = prompt("Parent mode code:");
    if (code === null) return;
    if (code !== state.parent.code) return alert("That code isn't correct.");
    mode = "parent";
    parentKidId ||= state.kids[0]?.id;
    document.getElementById("parentToggle").textContent = "👧 Kid view";
  } else {
    mode = "profiles";
    document.getElementById("parentToggle").textContent = "👨‍👩‍👧 Parent";
  }
  render();
};
document.getElementById("homeBtn").onclick = () => { mode = "profiles"; document.getElementById("parentToggle").textContent = "👨‍👩‍👧 Parent"; render(); };
document.getElementById("exportBtn").onclick = () => {
  const blob = new Blob([JSON.stringify(state,null,2)], {type:"application/json"});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "kids-quest-data.json"; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 500);
};

let dataWarning = "";
async function init() {
  let data = null;
  try {
    if (remoteEnabled()) {
      const r = await fetch(REMOTE_URL + "/latest", { headers: remoteHeaders() });
      if (!r.ok) throw new Error("remote HTTP " + r.status);
      const payload = await r.json();
      data = payload.record || payload; // JSONBin wraps data in .record
    } else {
      const r = await fetch(DATA_URL, { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      data = await r.json();
    }
    if (!data || typeof data !== "object") throw new Error("bad JSON");
  } catch (e) {
    try { data = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch {}
    if (!data) {
      // Embedded fallback — works even on file:// where fetch() is blocked.
      try { data = JSON.parse(document.getElementById("kidsQuestData")?.textContent); } catch {}
    }
    if (location.protocol !== "file:") {
      dataWarning = "⚠️ Couldn't load shared data (" + esc(e.message) + ") — using saved/embedded data.";
    }
  }
  state = normalize(data);
  render();
}
init();
