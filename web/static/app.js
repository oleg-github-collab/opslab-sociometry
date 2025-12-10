// State
const state = {
  me: null,
  questions: null,
  peers: [],
  answers: {},
  rankings: {},
};

// DOM selectors
const $ = (id) => document.getElementById(id);

// API helper
async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options,
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || res.statusText);
  }
  if (res.headers.get('content-type')?.includes('application/json')) {
    return res.json();
  }
  return res.text();
}

// UI State Management
function showLogin() {
  $('loginCard').classList.remove('hidden');
  ['surveyCard', 'peerCard', 'rankingCard', 'actionsCard', 'adminCard'].forEach(id => $(id).classList.add('hidden'));
  $('sessionBadge').innerHTML = '<span class="pill">не авторизовано</span>';
}

async function showLoggedInUI() {
  $('loginCard').classList.add('hidden');
  $('sessionBadge').innerHTML = `<span class="pill">Ви ввійшли як</span> <span class="pill strong">${state.me.name}</span>`;

  if (state.me.isAdmin) {
    $('adminCard').classList.remove('hidden');
    await loadAdminData();
  } else {
    ['surveyCard', 'peerCard', 'rankingCard', 'actionsCard'].forEach(id => $(id).classList.remove('hidden'));
    $('meBadge').textContent = state.me.name;
    await loadQuestions();
  }
}

// Session Management
async function fetchSession() {
  try {
    const me = await api('/api/me');
    state.me = me.participant;
    await showLoggedInUI();
  } catch {
    showLogin();
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const form = new FormData(e.target);
  const email = form.get('email');
  const code = form.get('code');
  $('loginError').classList.add('hidden');

  try {
    const res = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ email, code })
    });
    state.me = res.participant;
    await showLoggedInUI();
  } catch (err) {
    $('loginError').textContent = err.message || 'Помилка входу';
    $('loginError').classList.remove('hidden');
  }
}

async function handleLogout() {
  try {
    await api('/api/logout');
    state.me = null;
    state.questions = null;
    state.answers = {};
    state.rankings = {};
    showLogin();
  } catch (err) {
    console.error('Logout error:', err);
    // Force logout anyway
    window.location.reload();
  }
}

// Questions Loading
async function loadQuestions() {
  const data = await api('/api/questions');
  state.questions = data;
  state.peers = data.rankableParticipants;
  state.rankings = {};

  data.criteria.forEach(c => {
    state.rankings[c] = {
      order: state.peers.map(p => p.code),
      selfRank: Math.min(2, state.peers.length + 1),
      comment: '',
    };
  });

  renderCommon(data.common);
  renderPeers(data.peer);
  renderBoards(data.criteria);
}

function renderCommon(list) {
  $('commonQuestions').innerHTML = '';
  list.forEach(q => {
    const el = createQuestion(q);
    $('commonQuestions').appendChild(el);
  });
}

function groupByPeer(peerQuestions) {
  const map = {};
  peerQuestions.forEach(q => {
    if (!map[q.peerCode]) map[q.peerCode] = [];
    map[q.peerCode].push(q);
  });
  return map;
}

function renderPeers(peerQuestions) {
  $('peerQuestions').innerHTML = '';
  const grouped = groupByPeer(peerQuestions);

  Object.keys(grouped).forEach(code => {
    const peer = state.peers.find(p => p.code === code);
    const item = document.createElement('div');
    item.className = 'accordion-item';

    const header = document.createElement('div');
    header.className = 'accordion-header';
    header.innerHTML = `<div><p class="eyebrow">Відгук</p><h3>${peer?.name || code}</h3></div><div class="pill soft">collaboration • trust • growth</div>`;
    item.appendChild(header);

    const body = document.createElement('div');
    body.className = 'accordion-body';
    grouped[code].forEach(q => {
      const el = createQuestion(q);
      body.appendChild(el);
    });
    item.appendChild(body);

    header.addEventListener('click', () => item.classList.toggle('open'));
    $('peerQuestions').appendChild(item);
  });
}

function createQuestion(q) {
  const wrap = document.createElement('div');
  wrap.className = 'question';

  const label = document.createElement('div');
  label.className = 'title';
  label.innerHTML = `<strong>${q.title}</strong><span class="chip">${q.scope === 'common' ? 'спільне' : 'про колегу'}</span>`;
  wrap.appendChild(label);

  const desc = document.createElement('div');
  desc.className = 'desc';
  desc.textContent = q.description;
  wrap.appendChild(desc);

  const field = document.createElement('div');

  if (q.type === 'text') {
    const textarea = document.createElement('textarea');
    textarea.placeholder = 'Коротко, але конкретно';
    textarea.addEventListener('input', (e) => state.answers[q.id] = e.target.value);
    field.appendChild(textarea);
  } else if (q.type === 'choice') {
    const select = document.createElement('select');
    select.innerHTML = `<option value="">Обрати</option>` + q.choice.map(c => `<option value="${c}">${c}</option>`).join('');
    select.addEventListener('change', (e) => state.answers[q.id] = e.target.value);
    field.appendChild(select);
  } else if (q.type === 'scale') {
    const rangeWrap = document.createElement('div');
    rangeWrap.style.display = 'grid';
    rangeWrap.style.gap = '6px';

    const range = document.createElement('input');
    range.type = 'range';
    range.min = 1;
    range.max = q.scaleMax || 10;
    range.value = Math.ceil((q.scaleMax || 10) / 2);

    const label = document.createElement('div');
    label.className = 'hint';
    label.textContent = `Оцінка: ${range.value}/${q.scaleMax || 10}`;

    range.addEventListener('input', (e) => {
      label.textContent = `Оцінка: ${e.target.value}/${q.scaleMax || 10}`;
      state.answers[q.id] = Number(e.target.value);
    });

    rangeWrap.append(range, label);
    field.appendChild(rangeWrap);
    state.answers[q.id] = Number(range.value);
  }

  wrap.appendChild(field);
  return wrap;
}

// Ranking Boards
function renderBoards(criteria) {
  $('rankingBoards').innerHTML = '';

  criteria.forEach(name => {
    const board = document.createElement('div');
    board.className = 'board';
    board.innerHTML = `<h4>${name}</h4>`;

    const list = document.createElement('ul');
    list.className = 'draggable-list';
    list.dataset.criteria = name;

    (state.rankings[name].order || []).forEach(code => {
      const li = createDraggable(code);
      list.appendChild(li);
    });

    enableDrag(list);
    board.appendChild(list);

    const selfRank = document.createElement('div');
    selfRank.className = 'self-rank';
    selfRank.innerHTML = `
      <label>Куди ви поставили б себе за цим критерієм?</label>
      <input type="number" min="1" max="${state.peers.length + 1}" value="${state.rankings[name].selfRank}" />
      <textarea placeholder="Контекст про своє місце (опціонально)">${state.rankings[name].comment || ''}</textarea>
    `;

    const numberInput = selfRank.querySelector('input');
    const commentInput = selfRank.querySelector('textarea');

    numberInput.addEventListener('input', (e) => {
      state.rankings[name].selfRank = Number(e.target.value);
    });

    commentInput.addEventListener('input', (e) => {
      state.rankings[name].comment = e.target.value;
    });

    board.appendChild(selfRank);
    $('rankingBoards').appendChild(board);
  });
}

function createDraggable(code) {
  const peer = state.peers.find(p => p.code === code);
  const li = document.createElement('li');
  li.className = 'draggable';
  li.draggable = true;
  li.dataset.code = code;
  li.innerHTML = `<span>${peer ? peer.name : code}</span><span class="chip">тягни</span>`;
  return li;
}

function enableDrag(list) {
  let dragged;

  list.addEventListener('dragstart', (e) => {
    dragged = e.target;
    dragged.classList.add('dragging');
  });

  list.addEventListener('dragend', () => dragged?.classList.remove('dragging'));

  list.addEventListener('dragover', (e) => {
    e.preventDefault();
    const target = e.target.closest('.draggable');
    if (!target || target === dragged) return;

    const rect = target.getBoundingClientRect();
    const next = (e.clientY - rect.top) / rect.height > 0.5;
    list.insertBefore(dragged, next ? target.nextSibling : target);
    syncOrderFromDOM(list);
  });
}

function syncOrderFromDOM(list) {
  const criteria = list.dataset.criteria;
  const codes = Array.from(list.querySelectorAll('.draggable')).map(el => el.dataset.code);
  state.rankings[criteria].order = codes;
}

// Submit Response
async function handleSubmit() {
  $('saveStatus').textContent = 'Збереження...';

  try {
    const payload = {
      answers: Object.entries(state.answers).map(([questionId, value]) => ({ questionId, value })),
      rankings: Object.entries(state.rankings).map(([criteria, data]) => ({
        criteria,
        order: data.order,
        selfRank: Number(data.selfRank) || 0,
        comment: data.comment || '',
      })),
    };

    await api('/api/response', { method: 'POST', body: JSON.stringify(payload) });
    $('saveStatus').textContent = 'Збережено ✓';
    $('saveStatus').style.color = '#5bffb3';
  } catch (err) {
    $('saveStatus').textContent = 'Помилка: ' + err.message;
    $('saveStatus').style.color = '#ff9b9b';
  }
}

// Admin Panel
async function loadAdminData() {
  try {
    const [stats, responses] = await Promise.all([
      api('/api/admin/stats'),
      api('/api/admin/responses')
    ]);

    // Update stats
    $('statCompleted').textContent = stats.completed;
    $('statPending').textContent = stats.pending;
    $('statTotal').textContent = stats.total;

    // Completed list
    $('completedList').innerHTML = stats.completedList.length > 0
      ? stats.completedList.map(p => `<div class="participant-item">✅ ${p.name}</div>`).join('')
      : '<div class="hint">Ніхто ще не заповнив</div>';

    // Pending list
    $('pendingList').innerHTML = stats.pendingList.length > 0
      ? stats.pendingList.map(p => `<div class="participant-item">⏳ ${p.name} — ${p.email}</div>`).join('')
      : '<div class="hint">Всі заповнили!</div>';

    // Responses list
    $('responsesList').innerHTML = responses.length > 0
      ? responses.map(r => `
          <div class="response-item" data-code="${r.participantCode}">
            <div class="response-header">
              <strong>${r.participantName}</strong>
              <span class="chip">${new Date(r.submittedAt).toLocaleString('uk-UA')}</span>
            </div>
            <div class="response-meta">
              ${r.answersCount} відповідей, ${r.rankingsCount} ранжувань
              ${r.isTestData ? '<span class="badge">ТЕСТ</span>' : ''}
            </div>
          </div>
        `).join('')
      : '<div class="hint">Немає відповідей</div>';
  } catch (err) {
    console.error('Failed to load admin data:', err);
  }
}

async function viewResponseDetail(code) {
  try {
    const detail = await api(`/api/admin/response/${code}`);

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>${detail.participantName}</h2>
          <button class="btn-close">✕</button>
        </div>
        <div class="modal-body">
          <p class="hint">${detail.participantEmail || ''} • ${new Date(detail.submittedAt).toLocaleString('uk-UA')} ${detail.isTestData ? '• ТЕСТ' : ''}</p>

          <h3>Відповіді (${detail.answers.length})</h3>
          <div class="answers-list">
            ${detail.answers.map(a => `
              <div class="answer-item">
                <div class="answer-question">${a.questionId}</div>
                <div class="answer-value">${typeof a.value === 'object' ? JSON.stringify(a.value) : a.value}</div>
              </div>
            `).join('')}
          </div>

          <h3>Ранжування (${detail.rankings.length})</h3>
          <div class="rankings-list">
            ${detail.rankings.map(r => `
              <div class="ranking-item">
                <strong>${r.criteria}</strong>
                <div>Порядок: ${r.order.join(', ')}</div>
                <div>Себе на місці: ${r.selfRank}</div>
                ${r.comment ? `<div class="hint">${r.comment}</div>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Close handlers
    const closeModal = () => modal.remove();
    modal.querySelector('.btn-close').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
    modal.querySelector('.modal-content').addEventListener('click', (e) => {
      e.stopPropagation();
    });
  } catch (err) {
    alert('Помилка завантаження деталей: ' + err.message);
  }
}

async function handleRefreshAdmin() {
  $('adminStatus').textContent = 'Оновлення...';
  await loadAdminData();
  $('adminStatus').textContent = 'Дані оновлено ✓';
  setTimeout(() => $('adminStatus').textContent = '', 2000);
}

async function handleExport() {
  $('adminStatus').textContent = 'Готуємо експорт...';

  try {
    const data = await api('/api/admin/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `opslab-survey-export-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    $('adminStatus').textContent = 'JSON експортовано ✓';
    setTimeout(() => $('adminStatus').textContent = '', 3000);
  } catch (err) {
    $('adminStatus').textContent = 'Помилка: ' + err.message;
  }
}

async function handleTestData() {
  $('adminStatus').textContent = 'Записуємо тестові дані...';

  try {
    await api('/api/admin/run-test', { method: 'POST' });
    $('adminStatus').textContent = 'Тестові дані завантажені ✓';
    await loadAdminData();
  } catch (err) {
    $('adminStatus').textContent = 'Помилка: ' + err.message;
  }
}

async function handleReset() {
  if (!confirm('Ви впевнені? Це видалить ВСІ відповіді безповоротно!')) return;

  $('adminStatus').textContent = 'Очищення...';

  try {
    await api('/api/admin/reset', { method: 'POST' });
    $('adminStatus').textContent = 'База очищена ✓';
    await loadAdminData();
    setTimeout(() => $('adminStatus').textContent = '', 3000);
  } catch (err) {
    $('adminStatus').textContent = 'Помилка: ' + err.message;
  }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  // Login
  $('loginForm')?.addEventListener('submit', handleLogin);

  // Logout
  $('logoutBtn')?.addEventListener('click', handleLogout);
  $('adminLogoutBtn')?.addEventListener('click', handleLogout);

  // Submit response
  $('submitBtn')?.addEventListener('click', handleSubmit);

  // Admin actions
  $('refreshAdminBtn')?.addEventListener('click', handleRefreshAdmin);
  $('exportBtn')?.addEventListener('click', handleExport);
  $('testDataBtn')?.addEventListener('click', handleTestData);
  $('resetBtn')?.addEventListener('click', handleReset);

  // Response items click delegation
  $('responsesList')?.addEventListener('click', (e) => {
    const item = e.target.closest('.response-item');
    if (item && item.dataset.code) {
      viewResponseDetail(item.dataset.code);
    }
  });

  // Initialize session
  fetchSession();
});
