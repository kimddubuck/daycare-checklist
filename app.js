/* 어린이집 방문 체크리스트 — 화면 동작
   데이터는 이 기기의 브라우저(localStorage)에만 저장됩니다. 서버로 보내지 않습니다. */

const STORE_KEY = "daycare-checklist-v1";
const BACKUP_KEY = "daycare-checklist-v1-before-import";
const RATINGS = [
  { v: "good", label: "좋음", mark: "○", score: 2 },
  { v: "mid",  label: "보통", mark: "△", score: 1 },
  { v: "bad",  label: "아쉬움", mark: "✕", score: 0 }
];
const SCORE = Object.fromEntries(RATINGS.map(r => [r.v, r.score]));
const ALL_ITEMS = SECTIONS.flatMap(sec => sec.items.map(it => ({ ...it, sec })));

/* ---------- 저장/불러오기 ---------- */
function emptyState() { return { version: 1, centers: [], current: null }; }

// 예전에 저장된 데이터에 빠진 칸이 있어도 깨지지 않게 기본값을 채워 넣는다
function normalize(raw) {
  const st = emptyState();
  if (!raw || !Array.isArray(raw.centers)) return st;
  st.centers = raw.centers.filter(c => c && c.id).map(c => ({
    id: String(c.id),
    name: typeof c.name === "string" ? c.name : "이름 없는 어린이집",
    visitDate: typeof c.visitDate === "string" ? c.visitDate : "",
    ratings: c.ratings && typeof c.ratings === "object" ? c.ratings : {},
    notes: c.notes && typeof c.notes === "object" ? c.notes : {},
    memo: typeof c.memo === "string" ? c.memo : ""
  }));
  st.current = st.centers.some(c => c.id === raw.current) ? raw.current : (st.centers[0]?.id ?? null);
  return st;
}

function load() {
  try { return normalize(JSON.parse(localStorage.getItem(STORE_KEY))); }
  catch (e) { return emptyState(); }
}

let saveOk = true;
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); saveOk = true; }
  catch (e) { saveOk = false; }
  document.getElementById("saveWarn").hidden = saveOk;
}

let state = load();
let tab = "check";
let openNotes = new Set();

/* ---------- 계산 ---------- */
// 체크한 항목만으로 점수를 낸다(체크 안 한 항목은 빼고 계산)
function sectionScore(center, sec) {
  let got = 0, max = 0, done = 0;
  for (const it of sec.items) {
    const r = center.ratings[it.id];
    if (r in SCORE) { got += SCORE[r]; max += 2; done++; }
  }
  return { pct: max ? Math.round(got / max * 100) : null, done, total: sec.items.length };
}
function totalScore(center) {
  let got = 0, max = 0, done = 0;
  for (const it of ALL_ITEMS) {
    const r = center.ratings[it.id];
    if (!(r in SCORE)) continue;
    const w = it.sec.key ? 2 : 1;
    got += SCORE[r] * w; max += 2 * w; done++;
  }
  return { pct: max ? Math.round(got / max * 100) : null, done, total: ALL_ITEMS.length };
}

/* ---------- 도우미 ---------- */
const $ = sel => document.querySelector(sel);
function esc(s) {
  return String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}
function current() { return state.centers.find(c => c.id === state.current) || null; }
function newId() { return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function pctText(p) { return p === null ? "–" : p + "점"; }

/* ---------- 화면 그리기 ---------- */
function render() {
  document.querySelectorAll(".tab").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === tab));
  const main = $("#main");
  if (tab === "check") main.innerHTML = renderCheck();
  else if (tab === "compare") main.innerHTML = renderCompare();
  else main.innerHTML = renderBackup();
}

function renderChips() {
  const chips = state.centers.map(c =>
    `<button class="chip" data-act="pick" data-id="${esc(c.id)}" aria-pressed="${c.id === state.current}">${esc(c.name)}</button>`
  ).join("");
  return `<div class="chips">${chips}<button class="chip add" data-act="add">+ 어린이집 추가</button></div>`;
}

function renderCheck() {
  const c = current();
  if (!c) {
    return renderChips() + `<div class="empty"><p>아직 등록한 어린이집이 없어요.</p><p><b>+ 어린이집 추가</b>를 눌러 시작하세요.</p></div>`;
  }
  const tot = totalScore(c);
  let html = renderChips();
  html += `<section class="card head">
    <label class="field"><span>어린이집 이름</span><input id="nameInput" value="${esc(c.name)}" maxlength="30"></label>
    <label class="field"><span>방문한 날</span><input id="dateInput" type="date" value="${esc(c.visitDate)}"></label>
    <div class="progress"><div class="bar"><i style="width:${tot.done / tot.total * 100}%"></i></div>
      <span>${tot.done} / ${tot.total}개 체크</span></div>
    <button class="link danger" data-act="del">이 어린이집 기록 삭제</button>
  </section>`;
  for (const sec of SECTIONS) {
    const sc = sectionScore(c, sec);
    html += `<section class="card sec${sec.key ? " key" : ""}">
      <div class="sechead"><h2>${esc(sec.title)}</h2>${sec.key ? '<span class="tag">가장 중요 · 점수 2배</span>' : ""}</div>
      ${sec.why ? `<p class="why">${esc(sec.why)}</p>` : ""}
      ${sec.items.map(it => renderItem(c, it)).join("")}
      <p class="secscore">${sc.done}/${sc.total} 체크 · ${pctText(sc.pct)}</p>
    </section>`;
  }
  html += `<section class="card"><h2>전체 메모</h2>
    <textarea id="memoInput" rows="4" placeholder="원장님 인상, 분위기, 통학 거리 등 자유롭게">${esc(c.memo)}</textarea></section>`;
  return html;
}

function renderItem(c, it) {
  const r = c.ratings[it.id];
  const note = c.notes[it.id] || "";
  const open = openNotes.has(it.id) || note;
  const btns = RATINGS.map(x =>
    `<button class="rate ${x.v}" data-act="rate" data-item="${it.id}" data-v="${x.v}" aria-pressed="${r === x.v}"><b>${x.mark}</b>${x.label}</button>`
  ).join("");
  return `<div class="item">
    <p class="t">${esc(it.t)}${it.s ? `<small>${esc(it.s)}</small>` : ""}</p>
    <div class="rates">${btns}${open ? "" : `<button class="notebtn" data-act="note" data-item="${it.id}">메모</button>`}</div>
    ${open ? `<textarea class="note" data-item="${it.id}" rows="2" placeholder="이 항목 메모">${esc(note)}</textarea>` : ""}
  </div>`;
}

function renderCompare() {
  const cs = state.centers;
  if (!cs.length) return `<div class="empty"><p>비교할 어린이집이 아직 없어요.</p><p><b>체크하기</b> 탭에서 먼저 추가해 주세요.</p></div>`;
  const headCells = cs.map(c => `<th>${esc(c.name)}${c.visitDate ? `<small>${esc(c.visitDate)}</small>` : ""}</th>`).join("");
  const rows = SECTIONS.map(sec => `<tr class="${sec.key ? "key" : ""}"><td>${esc(sec.title)}${sec.key ? " <em>×2</em>" : ""}</td>${
    cs.map(c => { const s = sectionScore(c, sec); return `<td>${pctText(s.pct)}<small>${s.done}/${s.total}</small></td>`; }).join("")}</tr>`).join("");
  const totals = cs.map(c => totalScore(c));
  const best = Math.max(...totals.map(t => t.pct ?? -1));
  const totRow = `<tr class="total"><td>종합</td>${totals.map(t =>
    `<td class="${t.pct !== null && t.pct === best ? "best" : ""}">${pctText(t.pct)}<small>${t.done}/${t.total}</small></td>`).join("")}</tr>`;

  const warns = cs.map(c => {
    const bad = ALL_ITEMS.filter(it => c.ratings[it.id] === "bad");
    const list = bad.length
      ? bad.map(it => `<li><span class="sec-name">${esc(it.sec.title)}</span>${esc(it.t)}${c.notes[it.id] ? `<small>메모: ${esc(c.notes[it.id])}</small>` : ""}</li>`).join("")
      : `<li class="none">아쉬움으로 체크한 항목이 없어요.</li>`;
    return `<div class="warn"><h3>${esc(c.name)}</h3><ul>${list}</ul>${c.memo ? `<p class="memo-view">${esc(c.memo)}</p>` : ""}</div>`;
  }).join("");

  return `<section class="card"><h2>점수 비교</h2>
    <p class="why">좋음 2점, 보통 1점, 아쉬움 0점으로 계산해 100점 만점으로 바꿨어요. 체크하지 않은 항목은 계산에서 빠지니, 체크 개수가 비슷할 때 비교하는 게 공정해요.</p>
    <div class="tablewrap"><table><thead><tr><th>영역</th>${headCells}</tr></thead><tbody>${rows}${totRow}</tbody></table></div></section>
    <section class="card"><h2>주의 신호 모아보기</h2><p class="why">아쉬움으로 체크한 항목만 모았어요. 점수보다 이 목록이 결정에 더 중요할 수 있어요.</p>${warns}</section>`;
}

function renderBackup() {
  return `<section class="card"><h2>기록 보관과 옮기기</h2>
    <p class="why">체크한 내용은 지금 이 휴대폰의 브라우저 안에만 저장돼요. 인터넷 어딘가로 보내지 않아서 안전하지만, 브라우저 기록을 지우면 함께 사라질 수 있어요.</p>
    <div class="btnrow"><button class="primary" data-act="export">파일로 내보내기</button>
    <label class="primary ghost">파일에서 불러오기<input type="file" id="importFile" accept=".json,application/json" hidden></label></div>
    <p class="why">다른 휴대폰으로 옮기거나 가족과 주고받을 때는, 내보낸 파일을 메신저로 보내고 받는 쪽에서 불러오면 돼요. 불러오면 그 기기의 기존 기록은 파일 내용으로 바뀌고, 바뀌기 직전 상태는 한 번 자동으로 보관돼요.</p>
    <button class="link" data-act="restore">불러오기 직전 상태로 되돌리기</button>
    <p id="backupMsg" class="msg" role="status"></p></section>`;
}

/* ---------- 동작 ---------- */
document.addEventListener("click", e => {
  const tabBtn = e.target.closest(".tab");
  if (tabBtn) { tab = tabBtn.dataset.tab; render(); window.scrollTo(0, 0); return; }
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;
  const c = current();

  if (act === "pick") { state.current = b.dataset.id; openNotes.clear(); save(); render(); }
  else if (act === "add") {
    const name = prompt("어린이집 이름을 입력하세요", "");
    if (name === null) return;
    const id = newId();
    state.centers.push({ id, name: name.trim() || `어린이집 ${state.centers.length + 1}`, visitDate: "", ratings: {}, notes: {}, memo: "" });
    state.current = id; openNotes.clear(); save(); render();
  }
  else if (act === "del" && c) {
    if (!confirm(`'${c.name}' 기록을 삭제할까요? 되돌릴 수 없어요.`)) return;
    state.centers = state.centers.filter(x => x.id !== c.id);
    state.current = state.centers[0]?.id ?? null; save(); render();
  }
  else if (act === "rate" && c) {
    const id = b.dataset.item, v = b.dataset.v;
    if (c.ratings[id] === v) delete c.ratings[id]; else c.ratings[id] = v; // 같은 버튼을 다시 누르면 체크 해제
    save(); render();
  }
  else if (act === "note") { openNotes.add(b.dataset.item); render(); document.querySelector(`textarea.note[data-item="${b.dataset.item}"]`)?.focus(); }
  else if (act === "export") exportFile();
  else if (act === "restore") restoreBackup();
});

document.addEventListener("input", e => {
  const c = current();
  if (!c) return;
  const el = e.target;
  if (el.id === "nameInput") {
    c.name = el.value;
    document.querySelectorAll(`.chip[data-id="${CSS.escape(c.id)}"]`).forEach(ch => ch.textContent = el.value || "이름 없음");
  }
  else if (el.id === "dateInput") c.visitDate = el.value;
  else if (el.id === "memoInput") c.memo = el.value;
  else if (el.matches("textarea.note")) {
    if (el.value) c.notes[el.dataset.item] = el.value; else delete c.notes[el.dataset.item];
  }
  else return;
  save();
});

document.addEventListener("change", e => {
  if (e.target.id === "importFile" && e.target.files[0]) importFile(e.target.files[0]);
});

function setMsg(t) { const m = $("#backupMsg"); if (m) m.textContent = t; }

function exportFile() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  const d = new Date();
  a.href = URL.createObjectURL(blob);
  a.download = `어린이집체크_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  setMsg("파일을 내보냈어요. 다운로드 폴더를 확인해 주세요.");
}

function importFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try { data = JSON.parse(reader.result); } catch (e) { setMsg("이 파일은 읽을 수 없어요. 이 사이트에서 내보낸 .json 파일인지 확인해 주세요."); return; }
    const next = normalize(data);
    if (!next.centers.length) { setMsg("파일 안에 어린이집 기록이 없어요."); return; }
    if (!confirm(`파일에 어린이집 ${next.centers.length}곳 기록이 있어요. 지금 기록을 이 내용으로 바꿀까요?`)) return;
    try { localStorage.setItem(BACKUP_KEY, JSON.stringify(state)); } catch (e) {}
    state = next; save();
    setMsg(`${next.centers.length}곳 기록을 불러왔어요.`);
  };
  reader.readAsText(file);
}

function restoreBackup() {
  let prev = null;
  try { prev = localStorage.getItem(BACKUP_KEY); } catch (e) {}
  if (!prev) { setMsg("되돌릴 이전 상태가 없어요. 불러오기를 한 적이 있을 때만 쓸 수 있어요."); return; }
  if (!confirm("불러오기 직전 상태로 되돌릴까요?")) return;
  state = normalize(JSON.parse(prev)); save();
  setMsg("불러오기 직전 상태로 되돌렸어요.");
}

render();
