/* ========== Configuration ========== */
const API_BASE = "https://69229f5a09df4a492322e041.mockapi.io/api";
const TODOS_ENDPOINT = `${API_BASE}/todos`;

/* ========== Elements ========== */
const apiUrlEl = document.getElementById('api-url');
const statusEl = document.getElementById('status');
const listArea = document.getElementById('listArea');
const addBtn = document.getElementById('addBtn');
const titleInput = document.getElementById('titleInput');
const descInput = document.getElementById('descInput');
const dueInput = document.getElementById('dueInput');
const refreshBtn = document.getElementById('refreshBtn');
const views = document.getElementById('views');
const pageTitle = document.getElementById('pageTitle');
const searchInput = document.getElementById('search');
const filterSelect = document.getElementById('filterSelect');
const sortSelect = document.getElementById('sortSelect');
const darkToggle = document.getElementById('darkToggle');

const modal = document.getElementById('modal');
const editTitle = document.getElementById('editTitle');
const editDesc = document.getElementById('editDesc');
const editDue = document.getElementById('editDue');
const saveEditBtn = document.getElementById('saveEdit');
const cancelEditBtn = document.getElementById('cancelEdit');

const confirmModal = document.getElementById('confirmModal');
const confirmDeleteBtn = document.getElementById('confirmDelete');
const cancelDeleteBtn = document.getElementById('cancelDelete');

const toast = document.getElementById('toast');
apiUrlEl.textContent = TODOS_ENDPOINT;

/* ========== State ========== */
let todos = [];             // local cache of tasks
let currentView = 'inbox';  // inbox, today, upcoming
let editId = null;
let deleteId = null;
let notified = new Set();   // tasks that have been already notified

/* ========== Helpers ========== */
function setStatus(msg, loading = false) {
  statusEl.textContent = msg;
  if (loading) statusEl.classList.add('muted');
  else statusEl.classList.remove('muted');
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 5000);
  // browser notification if permission granted
  if (window.Notification && Notification.permission === 'granted') {
    new Notification('To-Do Reminder', { body: msg });
  } else if (window.Notification && Notification.permission !== 'denied') {
    Notification.requestPermission().then(p => {
      if (p === 'granted') {
        new Notification('To-Do Reminder', { body: msg });
      }
    });
  }
}

function isoToLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2,'0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth()+1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}
function toLocalString(iso) {
  if (!iso) return 'No due date';
  return new Date(iso).toLocaleString();
}

/* ========== Render ========== */
function render() {
  listArea.innerHTML = '';
  // filter by view
  let visible = [...todos];

  // view filter: today / upcoming
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
  const todayEnd = new Date(now); todayEnd.setHours(23,59,59,999);

  if (currentView === 'today') {
    visible = visible.filter(t => t.duedate && new Date(t.duedate) >= todayStart && new Date(t.duedate) <= todayEnd);
  } else if (currentView === 'upcoming') {
    const tomorrow = new Date(todayStart); tomorrow.setDate(tomorrow.getDate()+1);
    visible = visible.filter(t => t.duedate && new Date(t.duedate) >= tomorrow);
  }

  // search
  const q = searchInput.value.trim().toLowerCase();
  if (q) {
    visible = visible.filter(t => (t.title || '').toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q));
  }

  // filter select
  const filter = filterSelect.value;
  if (filter === 'pending') visible = visible.filter(t => !t.completed);
  if (filter === 'completed') visible = visible.filter(t => t.completed);
  if (filter === 'overdue') visible = visible.filter(t => t.duedate && new Date(t.duedate) < new Date() && !t.completed);

  // sort
  const sortMode = sortSelect.value;
  visible.sort((a,b) => {
    const da = a.duedate ? new Date(a.duedate).getTime() : Infinity;
    const db = b.duedate ? new Date(b.duedate).getTime() : Infinity;
    return sortMode === 'duedate_asc' ? da - db : db - da;
  });

  if (visible.length === 0) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'No tasks found.';
    listArea.appendChild(p);
    return;
  }

  visible.forEach(task => {
    const card = document.createElement('div');
    card.className = 'task-card';
    const due = task.duedate ? new Date(task.duedate) : null;
    const isOverdue = !task.completed && due && (new Date() > due);
    if (isOverdue) card.classList.add('overdue');
    if (task.completed) card.classList.add('completed');

    // left - checkbox
    const left = document.createElement('div');
    const cb = document.createElement('div');
    cb.className = 'checkbox' + (task.completed ? ' checked' : '');
    cb.innerHTML = task.completed ? '&#10003;' : '';
    cb.onclick = () => toggleComplete(task);
    left.appendChild(cb);

    // body
    const body = document.createElement('div');
    body.className = 'task-body';
    const title = document.createElement('div');
    title.className = 'task-title';
    title.textContent = task.title || '(No title)';
    const desc = document.createElement('div');
    desc.className = 'task-desc';
    desc.textContent = task.description || '';
    const meta = document.createElement('div');
    meta.className = 'task-meta';
    meta.textContent = task.duedate ? `Due: ${toLocalString(task.duedate)}` : 'No due date';

    body.appendChild(title);
    if (task.description) body.appendChild(desc);
    body.appendChild(meta);

    // actions
    const actions = document.createElement('div');
    actions.className = 'task-actions';
    const editBtn = document.createElement('button'); editBtn.className='icon-btn'; editBtn.title='Edit'; editBtn.textContent='✏️';
    editBtn.onclick = () => openEdit(task);
    const delBtn = document.createElement('button'); delBtn.className='icon-btn'; delBtn.title='Delete'; delBtn.textContent='🗑️';
    delBtn.onclick = () => openDelete(task);

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    card.appendChild(left);
    card.appendChild(body);
    card.appendChild(actions);

    listArea.appendChild(card);
  });
}

/* ========== API Calls ========== */
async function fetchTodos() {
  setStatus('Loading tasks...', true);
  try {
    const res = await fetch(TODOS_ENDPOINT);
    const data = await res.json();
    todos = data.map(t => ({ ...t, completed: !!t.completed }));
    setStatus(`Loaded ${todos.length} tasks`);
    // create sample reimbursement task if none exist
    if (todos.length === 0) await createSample();
    render();
  } catch (err) {
    console.error(err);
    setStatus('Failed to load tasks');
    showToast('Failed to load tasks from API');
  }
}

async function createSample() {
  setStatus('Creating sample task...', true);
  const sample = {
    title: "Request reimbursement for Tudor Day outreach",
    description: "Hi\nI hope this message finds you well.\n\nI am writing to request reimbursement for transport expenses incurred while conducting scholarship school outreach to Tudor Day. The costs cover transport to and from the school.",
    duedate: new Date(Date.now() + 24*60*60*1000).toISOString(),
    completed: false
  };
  try {
    const res = await fetch(TODOS_ENDPOINT, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(sample)
    });
    const created = await res.json();
    todos.push(created);
    setStatus('Sample created');
  } catch (e) {
    console.error(e);
    setStatus('Failed to create sample');
  }
}

async function addTask() {
  const title = titleInput.value.trim();
  const description = descInput.value.trim();
  const duedate = dueInput.value ? new Date(dueInput.value).toISOString() : null;
  if (!title) { alert('Title is required'); return; }

  const payload = { title, description, duedate, completed: false };
  setStatus('Saving...', true);
  try {
    const res = await fetch(TODOS_ENDPOINT, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const created = await res.json();
    todos.push(created);
    titleInput.value = ''; descInput.value = ''; dueInput.value = '';
    setStatus('Added successfully');
    render();
  } catch (e) {
    console.error(e); setStatus('Add failed'); showToast('Failed to add task');
  }
}

async function toggleComplete(task) {
  const updated = { ...task, completed: !task.completed };
  setStatus('Updating...', true);
  try {
    const res = await fetch(`${TODOS_ENDPOINT}/${task.id}`, {
      method: 'PUT',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(updated)
    });
    const json = await res.json();
    const idx = todos.findIndex(t => t.id === task.id);
    if (idx > -1) todos[idx] = json;
    setStatus('Updated');
    render();
  } catch (e) { console.error(e); setStatus('Update failed'); showToast('Failed to update task'); }
}

function openEdit(task) {
  editId = task.id;
  editTitle.value = task.title || '';
  editDesc.value = task.description || '';
  editDue.value = isoToLocalInput(task.duedate);
  modal.classList.remove('hidden'); modal.setAttribute('aria-hidden','false');
}

cancelEditBtn.onclick = () => { editId = null; modal.classList.add('hidden'); modal.setAttribute('aria-hidden','true'); };

async function saveEdit() {
  if (!editId) return;
  const title = editTitle.value.trim(); if (!title) { alert('Title required'); return; }
  const description = editDesc.value.trim();
  const duedate = editDue.value ? new Date(editDue.value).toISOString() : null;
  const base = todos.find(t => t.id === editId) || {};
  const payload = { ...base, title, description, duedate };
  setStatus('Saving...', true);
  try {
    const res = await fetch(`${TODOS_ENDPOINT}/${editId}`, {
      method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
    });
    const json = await res.json();
    const idx = todos.findIndex(t => t.id === editId);
    if (idx > -1) todos[idx] = json;
    setStatus('Saved');
    editId = null; modal.classList.add('hidden'); modal.setAttribute('aria-hidden','true');
    render();
  } catch (e) { console.error(e); setStatus('Save failed'); showToast('Failed to save task'); }
}
saveEditBtn.onclick = saveEdit;

/* Delete flow */
function openDelete(task) {
  deleteId = task.id;
  confirmModal.classList.remove('hidden'); confirmModal.setAttribute('aria-hidden','false');
}
cancelDeleteBtn.onclick = () => { deleteId = null; confirmModal.classList.add('hidden'); confirmModal.setAttribute('aria-hidden','true'); };
async function confirmDelete() {
  if (!deleteId) return;
  setStatus('Deleting...', true);
  try {
    const res = await fetch(`${TODOS_ENDPOINT}/${deleteId}`, { method: 'DELETE' });
    if (res.ok) {
      todos = todos.filter(t => t.id !== deleteId);
      setStatus('Deleted');
      confirmModal.classList.add('hidden'); confirmModal.setAttribute('aria-hidden','true');
      render();
    } else {
      setStatus('Delete failed'); showToast('Delete failed');
    }
  } catch (e) { console.error(e); setStatus('Delete failed'); showToast('Delete failed'); }
}
confirmDeleteBtn.onclick = confirmDelete;

/* Due date checks -> notifications and overdue marking */
function checkDueDates() {
  const now = new Date();
  todos.forEach(task => {
    if (!task || task.completed) return;
    if (!task.duedate) return;
    const due = new Date(task.duedate);
    // notify once when due time passed (within 60s window) or if just became overdue
    if (now >= due && !notified.has(task.id)) {
      notified.add(task.id);
      const msg = `Task due: ${task.title}`;
      showToast(msg);
    }
  });
}
// run every 20s
setInterval(checkDueDates, 20*1000);

/* ========== UI wiring ========== */
addBtn.addEventListener('click', addTask);
refreshBtn.addEventListener('click', fetchTodos);

views.addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  [...views.querySelectorAll('button')].forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentView = btn.dataset.view;
  pageTitle.textContent = btn.textContent;
  render();
});

searchInput.addEventListener('input', () => render());
filterSelect.addEventListener('change', () => render());
sortSelect.addEventListener('change', () => render());

darkToggle.addEventListener('click', () => {
  document.documentElement.classList.toggle('dark');
  if (document.documentElement.classList.contains('dark')) {
    darkToggle.textContent = 'Light';
    document.documentElement.style.setProperty('--bg','#0b1220');
    document.documentElement.style.setProperty('--card','#081024');
    document.documentElement.style.setProperty('--text','#e6eef8');
  } else {
    darkToggle.textContent = 'Dark';
    document.documentElement.style.removeProperty('--bg');
    document.documentElement.style.removeProperty('--card');
    document.documentElement.style.removeProperty('--text');
  }
});

/* keyboard: Enter to add when title focused */
titleInput.addEventListener('keydown', e => { if (e.key === 'Enter') addTask(); });

/* init */
fetchTodos();
