// State
const state = {
  me: null,
  questions: null,
  peers: [],
  answers: {},
  rankings: {},
};

// Auto-save to localStorage
function saveStateToLocal() {
  if (!state.me) return;
  const key = `survey_state_${state.me.code}`;
  localStorage.setItem(key, JSON.stringify({
    answers: state.answers,
    rankings: state.rankings,
    timestamp: new Date().toISOString()
  }));
  console.log('Автозбереження виконано:', new Date().toLocaleTimeString());
}

function loadStateFromLocal() {
  if (!state.me) return;
  const key = `survey_state_${state.me.code}`;
  const saved = localStorage.getItem(key);
  if (saved) {
    try {
      const data = JSON.parse(saved);
      state.answers = data.answers || {};
      state.rankings = data.rankings || {};
      console.log('Відновлено дані з автозбереження:', data.timestamp);
    } catch (e) {
      console.error('Помилка відновлення даних:', e);
    }
  }
}

// Debounce helper for auto-save
let autoSaveTimeout;
function triggerAutoSave() {
  clearTimeout(autoSaveTimeout);
  autoSaveTimeout = setTimeout(saveStateToLocal, 500);
}

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
      peerRankings: {},
      comment: '',
    };
  });

  // Restore from localStorage if exists
  loadStateFromLocal();

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
    textarea.addEventListener('input', (e) => {
      state.answers[q.id] = e.target.value;
      triggerAutoSave();
    });
    field.appendChild(textarea);
  } else if (q.type === 'choice') {
    const select = document.createElement('select');
    select.innerHTML = `<option value="">Обрати</option>` + q.choice.map(c => `<option value="${c}">${c}</option>`).join('');
    select.addEventListener('change', (e) => {
      state.answers[q.id] = e.target.value;
      triggerAutoSave();
    });
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
      triggerAutoSave();
    });

    rangeWrap.append(range, label);
    field.appendChild(rangeWrap);
    state.answers[q.id] = Number(range.value);
  }

  wrap.appendChild(field);
  return wrap;
}

// Criteria descriptions
function getCriteriaDescription(criteriaName) {
  const descriptions = {
    "Ініціативність та відповідальність": "Хто найчастіше бере на себе відповідальність за результат, проявляє ініціативу без додаткових запитів, і доводить справи до кінця?",
    "Лідерство": "Хто найкраще веде команду за собою, надихає інших, приймає складні рішення і бере на себе роль координатора в критичних ситуаціях?",
    "Розвиток бізнесу OPSLAB": "Хто робить найбільший внесок у розвиток бізнесу компанії, генерує ідеї для зростання, залучає клієнтів або покращує процеси?"
  };
  return descriptions[criteriaName] || "";
}

// Ranking Boards - Grid-based "Морський бій" style
function renderBoards(criteria) {
  $('rankingBoards').innerHTML = '';

  criteria.forEach(name => {
    const board = document.createElement('div');
    board.className = 'board';

    // Header with criteria description
    const header = document.createElement('h4');
    header.textContent = name;
    board.appendChild(header);

    // Criteria description
    const description = getCriteriaDescription(name);
    if (description) {
      const descEl = document.createElement('p');
      descEl.className = 'criteria-description';
      descEl.textContent = description;
      board.appendChild(descEl);
    }

    // Instruction for MY ranking
    const instr1 = document.createElement('p');
    instr1.className = 'board-instruction';
    instr1.innerHTML = `<strong>📊 Крок 1:</strong> Проранжуйте колег від найсильнішого (1) до найслабшого (${state.peers.length}). Натисніть на клітинку.`;
    board.appendChild(instr1);

    // Grid 1: My ranking of colleagues
    const grid1 = createRankingGrid(name, state.peers, 'my-ranking');
    board.appendChild(grid1);

    // Instruction for PEER ranking of me
    const instr2 = document.createElement('p');
    instr2.className = 'board-instruction';
    instr2.style.marginTop = '24px';
    instr2.innerHTML = `<strong>👥 Крок 2:</strong> Де кожен колега поставить <u>МЕНЕ</u>? (можна багато виборів на одне місце)`;
    board.appendChild(instr2);

    // Grid 2: Peer rankings of me
    const grid2 = createRankingGrid(name, state.peers, 'peer-ranking');
    board.appendChild(grid2);

    // Optional comment
    const commentSection = document.createElement('div');
    commentSection.className = 'rank-comment';
    commentSection.innerHTML = `
      <label>💬 Коментар (опціонально):</label>
      <textarea placeholder="Ваші думки щодо цього критерію...">${state.rankings[name].comment || ''}</textarea>
    `;

    const commentInput = commentSection.querySelector('textarea');
    commentInput.addEventListener('input', (e) => {
      state.rankings[name].comment = e.target.value;
      triggerAutoSave();
    });

    board.appendChild(commentSection);
    $('rankingBoards').appendChild(board);
  });
}

function createRankingGrid(criteria, peers, type) {
  const gridContainer = document.createElement('div');
  gridContainer.className = 'ranking-grid-container';

  const positions = peers.length; // Number of positions (excluding self)

  // Create table
  const table = document.createElement('table');
  table.className = 'ranking-grid';
  table.dataset.criteria = criteria;
  table.dataset.type = type;

  // Header row
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headerRow.innerHTML = '<th></th>'; // Empty corner cell
  for (let pos = 1; pos <= positions; pos++) {
    headerRow.innerHTML += `<th><div class="position-label">${pos}</div></th>`;
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Body rows
  const tbody = document.createElement('tbody');
  peers.forEach(peer => {
    const row = document.createElement('tr');
    row.dataset.peer = peer.code;

    // Row header with peer name
    const nameCell = document.createElement('th');
    nameCell.className = 'peer-name-cell';
    nameCell.innerHTML = `<div class="peer-name">${peer.name}</div>`;
    row.appendChild(nameCell);

    // Position cells
    for (let pos = 1; pos <= positions; pos++) {
      const cell = document.createElement('td');
      cell.className = 'grid-cell';
      cell.dataset.peer = peer.code;
      cell.dataset.position = pos;

      // Check if this cell should be selected
      const isSelected = isCellSelected(criteria, peer.code, pos, type);
      if (isSelected) {
        cell.classList.add('selected');
      }

      // Click handler
      cell.addEventListener('click', () => {
        handleCellClick(criteria, peer.code, pos, type, cell);
      });

      row.appendChild(cell);
    }

    tbody.appendChild(row);
  });
  table.appendChild(tbody);

  gridContainer.appendChild(table);
  return gridContainer;
}

function isCellSelected(criteria, peerCode, position, type) {
  if (type === 'my-ranking') {
    // Check if this peer is at this position in my ranking
    const order = state.rankings[criteria].order || [];
    return order[position - 1] === peerCode;
  } else {
    // Check if this peer thinks I'm at this position
    const peerRankings = state.rankings[criteria].peerRankings || {};
    return peerRankings[peerCode] === position;
  }
}

function handleCellClick(criteria, peerCode, position, type, cell) {
  if (type === 'my-ranking') {
    // MY ranking: only one selection per row (per peer)
    const order = state.rankings[criteria].order || [];

    // Remove this peer from current position if exists
    const currentIndex = order.indexOf(peerCode);
    if (currentIndex !== -1) {
      order.splice(currentIndex, 1);
    }

    // If clicking already selected cell, just deselect (already removed above)
    if (!cell.classList.contains('selected')) {
      // Insert peer at new position
      order.splice(position - 1, 0, peerCode);
    }

    state.rankings[criteria].order = order;
  } else {
    // PEER ranking of me: multiple selections allowed
    if (!state.rankings[criteria].peerRankings) {
      state.rankings[criteria].peerRankings = {};
    }

    if (cell.classList.contains('selected')) {
      // Deselect
      delete state.rankings[criteria].peerRankings[peerCode];
    } else {
      // Select
      state.rankings[criteria].peerRankings[peerCode] = position;
    }
  }

  // Re-render the grid
  triggerAutoSave();
  const board = cell.closest('.board');
  const criteriaName = criteria;
  refreshGrid(board, criteriaName, type);
}

function refreshGrid(board, criteria, type) {
  const table = board.querySelector(`table[data-criteria="${criteria}"][data-type="${type}"]`);
  if (!table) return;

  // Update all cells
  table.querySelectorAll('.grid-cell').forEach(cell => {
    const peerCode = cell.dataset.peer;
    const position = Number(cell.dataset.position);
    const isSelected = isCellSelected(criteria, peerCode, position, type);

    if (isSelected) {
      cell.classList.add('selected');
    } else {
      cell.classList.remove('selected');
    }
  });
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
        peerRankings: data.peerRankings || {},
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

    console.log('Admin data loaded:', { stats, responses });

    // Update stats
    $('statCompleted').textContent = stats?.completed ?? 0;
    $('statPending').textContent = stats?.pending ?? 0;
    $('statTotal').textContent = stats?.total ?? 0;

    // Completed list
    const completedList = stats?.completedList || [];
    $('completedList').innerHTML = completedList.length > 0
      ? completedList.map(p => `<div class="participant-item">✅ ${p.name}</div>`).join('')
      : '<div class="hint">Ніхто ще не заповнив</div>';

    // Pending list
    const pendingList = stats?.pendingList || [];
    $('pendingList').innerHTML = pendingList.length > 0
      ? pendingList.map(p => `<div class="participant-item">⏳ ${p.name} — ${p.email}</div>`).join('')
      : '<div class="hint">Всі заповнили!</div>';

    // Responses list
    const responsesList = responses || [];
    $('responsesList').innerHTML = responsesList.length > 0
      ? responsesList.map(r => `
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
      : '<div class="hint">Немає відповідей. Натисніть "🧪 Заповнити тестовими" щоб створити дані для перегляду.</div>';

    console.log('Responses rendered:', responsesList.length);
  } catch (err) {
    console.error('Failed to load admin data:', err);
    $('responsesList').innerHTML = '<div class="hint error">❌ Помилка завантаження даних</div>';
  }
}

async function viewResponseDetail(code) {
  console.log('Opening response detail for:', code);
  try {
    const detail = await api(`/api/admin/response/${code}`);
    console.log('Response detail loaded:', detail);

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
