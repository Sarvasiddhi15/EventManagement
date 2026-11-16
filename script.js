/* =========================================================
   Gather – Event Manager
   Concepts used: state object, DOM updates, event delegation,
   localStorage persistence, array methods, input escaping.
   ========================================================= */

// 1. STATE ---------------------------------------------------
// The single source of truth. The screen is always drawn FROM this.
let state = loadState();

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem("gather-data"));
    if (saved && Array.isArray(saved.events)) return saved;
  } catch (e) { /* corrupted data – ignore and start fresh */ }
  return { events: [], selectedId: null, filter: "" };
}
function saveState() {
  localStorage.setItem("gather-data", JSON.stringify(state));
}

// 2. HELPERS -------------------------------------------------
const $ = (id) => document.getElementById(id);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const currentEvent = () => state.events.find((e) => e.id === state.selectedId);

// Prevents users from injecting HTML (basic XSS protection)
function esc(text) {
  const d = document.createElement("div");
  d.textContent = text;
  return d.innerHTML;
}
function formatDate(iso) {
  return new Date(iso + "T00:00").toLocaleDateString(undefined,
    { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}
let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2000);
}
function update() { saveState(); render(); }

// 3. RENDER (updates the DOM) -------------------------------
function render() {
  renderEvents();
  renderGuests();
}

function renderEvents() {
  const list = $("event-list");
  if (!state.events.length) {
    list.innerHTML = '<p class="empty">No events yet. Create your first one above.</p>';
    return;
  }
  list.innerHTML = state.events.map((e) => `
    <button class="event-card ${e.id === state.selectedId ? "active" : ""}" data-id="${e.id}">
      <strong>${esc(e.name)}</strong>
      <span>${formatDate(e.date)}</span>
      <span>${esc(e.place)} · ${e.guests.length} guest${e.guests.length === 1 ? "" : "s"}</span>
    </button>`).join("");
}

function renderGuests() {
  const area = $("guest-area");
  const ev = currentEvent();
  if (!ev) {
    area.innerHTML = '<p class="empty">Select an event to manage its guests.</p>';
    return;
  }
  const count = (s) => ev.guests.filter((g) => g.rsvp === s).length;
  const q = state.filter.toLowerCase();
  const shown = ev.guests.filter((g) =>
    g.name.toLowerCase().includes(q) || g.email.toLowerCase().includes(q));

  area.innerHTML = `
    <div class="event-head">
      <div><strong>${esc(ev.name)}</strong><p>${formatDate(ev.date)} · ${esc(ev.place)}</p></div>
      <button class="btn small ghost" data-action="delete-event">Delete event</button>
    </div>
    <div class="stats">
      <div class="stat"><b>${ev.guests.length}</b><small>Invited</small></div>
      <div class="stat"><b>${count("yes")}</b><small>Going</small></div>
      <div class="stat"><b>${count("maybe")}</b><small>Maybe</small></div>
      <div class="stat"><b>${count("no")}</b><small>Declined</small></div>
    </div>
    <form id="guest-form" class="guest-form">
      <input id="g-name" placeholder="Guest name" required>
      <input id="g-email" type="email" placeholder="Email" required>
      <button class="btn" type="submit">Invite</button>
    </form>
    ${ev.guests.length ? `<input id="search" class="search" placeholder="Search guests" value="${esc(state.filter)}">` : ""}
    <div>
      ${shown.length ? shown.map((g) => `
        <div class="guest" data-gid="${g.id}">
          <div class="who">${esc(g.name)}<small>${esc(g.email)}</small></div>
          <select class="${g.rsvp}" data-action="rsvp" aria-label="RSVP for ${esc(g.name)}">
            <option value="pending" ${g.rsvp === "pending" ? "selected" : ""}>Pending</option>
            <option value="yes" ${g.rsvp === "yes" ? "selected" : ""}>Going</option>
            <option value="maybe" ${g.rsvp === "maybe" ? "selected" : ""}>Maybe</option>
            <option value="no" ${g.rsvp === "no" ? "selected" : ""}>Declined</option>
          </select>
          <button class="btn small ghost" data-action="remove-guest">Remove</button>
        </div>`).join("")
        : '<p class="empty">' + (ev.guests.length ? "No guests match your search." : "No guests yet. Invite someone above.") + "</p>"}
    </div>`;

  // Keep keyboard focus in the search box while typing
  if (document.activeElement === document.body && state.filter) {
    const s = $("search"); if (s) { s.focus(); s.setSelectionRange(99, 99); }
  }
}

// 4. EVENTS --------------------------------------------------
// Create event
$("event-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const ev = { id: uid(), name: $("ev-name").value.trim(), date: $("ev-date").value,
               place: $("ev-place").value.trim(), guests: [] };
  state.events.push(ev);
  state.selectedId = ev.id;
  state.filter = "";
  e.target.reset();
  update();
  toast("Event created");
});

// Select an event (event delegation: one listener for all cards)
$("event-list").addEventListener("click", (e) => {
  const card = e.target.closest(".event-card");
  if (!card) return;
  state.selectedId = card.dataset.id;
  state.filter = "";
  update();
});

// Guest panel: add guest, search, RSVP change, remove (all delegated)
const guestArea = $("guest-area");

guestArea.addEventListener("submit", (e) => {
  if (e.target.id !== "guest-form") return;
  e.preventDefault();
  const ev = currentEvent();
  const email = $("g-email").value.trim();
  if (ev.guests.some((g) => g.email.toLowerCase() === email.toLowerCase())) {
    return toast("That email is already invited");
  }
  ev.guests.push({ id: uid(), name: $("g-name").value.trim(), email, rsvp: "pending" });
  update();
  toast("Guest invited");
  $("g-name").focus();
});

guestArea.addEventListener("input", (e) => {
  if (e.target.id !== "search") return;
  state.filter = e.target.value;
  renderGuests();            // re-draw only (no need to save a search)
  const s = $("search"); s.focus(); s.setSelectionRange(99, 99);
});

guestArea.addEventListener("change", (e) => {
  if (e.target.dataset.action !== "rsvp") return;
  const gid = e.target.closest(".guest").dataset.gid;
  currentEvent().guests.find((g) => g.id === gid).rsvp = e.target.value;
  update();
});

guestArea.addEventListener("click", (e) => {
  const action = e.target.dataset.action;
  const ev = currentEvent();
  if (action === "remove-guest") {
    const gid = e.target.closest(".guest").dataset.gid;
    ev.guests = ev.guests.filter((g) => g.id !== gid);
    update(); toast("Guest removed");
  }
  if (action === "delete-event" && confirm(`Delete "${ev.name}" and its guest list?`)) {
    state.events = state.events.filter((x) => x.id !== ev.id);
    state.selectedId = null;
    update(); toast("Event deleted");
  }
});

// 5. START ---------------------------------------------------
render();
