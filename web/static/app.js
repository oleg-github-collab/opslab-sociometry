const state = {
  me: null,
  questions: null,
  peers: [],
  answers: {},
  rankings: {},
};

const selectors = {
  loginCard: document.getElementById('loginCard'),
  surveyCard: document.getElementById('surveyCard'),
  peerCard: document.getElementById('peerCard'),
  rankingCard: document.getElementById('rankingCard'),
  actionsCard: document.getElementById('actionsCard'),
  adminCard: document.getElementById('adminCard'),
  commonQuestions: document.getElementById('commonQuestions'),
  peerQuestions: document.getElementById('peerQuestions'),
  rankingBoards: document.getElementById('rankingBoards'),
  sessionBadge: document.getElementById('sessionBadge'),
  meBadge: document.getElementById('meBadge'),
  loginForm: document.getElementById('loginForm'),
  loginError: document.getElementById('loginError'),
  submitBtn: document.getElementById('submitBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
  saveStatus: document.getElementById('saveStatus'),
  exportBtn: document.getElementById('exportBtn'),
  testDataBtn: document.getElementById('testDataBtn'),
  resetBtn: document.getElementById('resetBtn'),
  adminStatus: document.getElementById('adminStatus'),
  statCompleted: document.getElementById('statCompleted'),
  statPending: document.getElementById('statPending'),
  statTotal: document.getElementById('statTotal'),
  completedList: document.getElementById('completedList'),
  pendingList: document.getElementById('pendingList'),
  responsesList: document.getElementById('responsesList'),
};

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
    },
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

async function showLoggedInUI() {
  selectors.loginCard.classList.add('hidden');
  selectors.sessionBadge.innerHTML = `<span class="pill">Ви ввійшли як</span> <span class="pill strong">${state.me.name}</span>`;

  if (state.me.isAdmin) {
    selectors.adminCard.classList.remove('hidden');
    await loadAdminData();
  } else {
    ['surveyCard', 'peerCard', 'rankingCard', 'actionsCard'].forEach(id => selectors[id].classList.remove('hidden'));
    selectors.meBadge.textContent = state.me.name;
  }
}

function showLogin() {
  selectors.loginCard.classList.remove('hidden');
  ['surveyCard', 'peerCard', 'rankingCard', 'actionsCard', 'adminCard'].forEach(id => selectors[id].classList.add('hidden'));
  selectors.sessionBadge.innerHTML = `<span class="pill">не авторизовано</span>`;
}

async function fetchSession() {
  try {
    const me = await api('/api/me');
    state.me = me.participant;
    showLoggedInUI();
    await loadQuestions();
  } catch (_) {
    showLogin();
  }
}

selectors.loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(selectors.loginForm);
  const email = form.get('email');
  const code = form.get('code');
  selectors.loginError.classList.add('hidden');
  try {
    const res = await api('/api/login', { method: 'POST', body: JSON.stringify({ email, code }) });
    state.me = res.participant;
    showLoggedInUI();
    await loadQuestions();
  } catch (err) {
    selectors.loginError.textContent = err.message || 'Помилка входу';
    selectors.loginError.classList.remove('hidden');
  }
});

selectors.logoutBtn.addEventListener('click', async () => {
  await api('/api/logout');
  state.me = null;
  state.questions = null;
  state.answers = {};
  state.rankings = {};
  showLogin();
});

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
  selectors.commonQuestions.innerHTML = '';
  list.forEach(q => {
    const el = createQuestion(q);
    selectors.commonQuestions.appendChild(el);
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
  selectors.peerQuestions.innerHTML = '';
  const grouped = groupByPeer(peerQuestions);
  Object.keys(grouped).forEach(code => {
    const peer = state.peers.find(p => p.code === code);
    const item = document.createElement('div');
    item.className = 'accordion-item';

    const header = document.createElement('div');
    header.className = 'accordion-header';
    header.innerHTML = `<div><p class="eyebrow">Відгук</p><h3>${peer?.name || code}</h3></div><div class="pill soft">ownership • leadership • business</div>`;
    item.appendChild(header);

    const body = document.createElement('div');
    body.className = 'accordion-body';
    grouped[code].forEach(q => {
      const el = createQuestion(q);
      body.appendChild(el);
    });
    item.appendChild(body);

    header.addEventListener('click', () => item.classList.toggle('open'));
    selectors.peerQuestions.appendChild(item);
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
  switch (q.type) {
    case 'text': {
      const textarea = document.createElement('textarea');
      textarea.placeholder = 'Коротко, але конкретно';
      textarea.addEventListener('input', (e) => updateAnswer(q.id, e.target.value));
      field.appendChild(textarea);
      break;
    }
    case 'choice': {
      const select = document.createElement('select');
      select.innerHTML = `<option value="">Обрати</option>` + q.choice.map(c => `<option value="${c}">${c}</option>`).join('');
      select.addEventListener('change', (e) => updateAnswer(q.id, e.target.value));
      field.appendChild(select);
      break;
    }
    case 'scale': {
      const rangeWrap = document.createElement('div');
      rangeWrap.style.display = 'grid';
      rangeWrap.style.gap = '6px';
      const range = document.createElement('input');
      range.type = 'range';
      range.min = 1;
      range.max = q.scaleMax || 5;
      range.value = Math.ceil((q.scaleMax || 5) / 2);
      const label = document.createElement('div');
      label.className = 'hint';
      label.textContent = `Оцінка: ${range.value}/${q.scaleMax || 5}`;
      range.addEventListener('input', (e) => {
        label.textContent = `Оцінка: ${e.target.value}/${q.scaleMax || 5}`;
        updateAnswer(q.id, Number(e.target.value));
      });
      rangeWrap.append(range, label);
      field.appendChild(rangeWrap);
      updateAnswer(q.id, Number(range.value));
      break;
    }
  }
  wrap.appendChild(field);
  return wrap;
}

function updateAnswer(id, value) {
  state.answers[id] = value;
}

function renderBoards(criteria) {
  selectors.rankingBoards.innerHTML = '';
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
    selectors.rankingBoards.appendChild(board);
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
    const next = (e.clientY - rect.top) / (rect.height) > 0.5;
    list.insertBefore(dragged, next ? target.nextSibling : target);
    syncOrderFromDOM(list);
  });
}

function syncOrderFromDOM(list) {
  const criteria = list.dataset.criteria;
  const codes = Array.from(list.querySelectorAll('.draggable')).map(el => el.dataset.code);
  state.rankings[criteria].order = codes;
}

selectors.submitBtn.addEventListener('click', async () => {
  selectors.saveStatus.textContent = 'Збереження...';
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
    selectors.saveStatus.textContent = 'Збережено. Дякуємо за точність! Дані гарантовано збережені.';
    selectors.saveStatus.style.color = '#5bffb3';
  } catch (err) {
    selectors.saveStatus.textContent = 'Помилка: ' + err.message;
    selectors.saveStatus.style.color = '#ff9b9b';
  }
});

selectors.exportBtn?.addEventListener('click', async () => {
  selectors.adminStatus.textContent = 'Готуємо експорт...';
  try {
    const data = await api('/api/admin/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `opslab-survey-export-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    selectors.adminStatus.textContent = 'JSON експортовано (дивись файл завантажень).';
  } catch (err) {
    selectors.adminStatus.textContent = 'Не вдалося експортувати: ' + err.message;
  }
});

selectors.testDataBtn?.addEventListener('click', async () => {
  selectors.adminStatus.textContent = 'Записуємо тестові дані...';
  try {
    await api('/api/admin/run-test', { method: 'POST' });
    selectors.adminStatus.textContent = 'Тестові дані завантажені. Перевірте в експорті, далі натисніть «Очистити».';
  } catch (err) {
    selectors.adminStatus.textContent = 'Помилка: ' + err.message;
  }
});

selectors.resetBtn?.addEventListener('click', async () => {
  if (!confirm('Ви впевнені? Це видалить ВСІ відповіді безповоротно!')) return;
  selectors.adminStatus.textContent = 'Очищення...';
  try {
    await api('/api/admin/reset', { method: 'POST' });
    selectors.adminStatus.textContent = 'База очищена. Продакшн готовий до живих відповідей.';
    await loadAdminData();
  } catch (err) {
    selectors.adminStatus.textContent = 'Не вийшло очистити: ' + err.message;
  }
});

async function loadAdminData() {
  try {
    const [stats, responses] = await Promise.all([
      api('/api/admin/stats'),
      api('/api/admin/responses')
    ]);

    // Update stats
    selectors.statCompleted.textContent = stats.completed;
    selectors.statPending.textContent = stats.pending;
    selectors.statTotal.textContent = stats.total;

    // Completed list
    selectors.completedList.innerHTML = stats.completedList.length > 0
      ? stats.completedList.map(p => `<div class="participant-item">✅ ${p.name}</div>`).join('')
      : '<div class="hint">Ніхто ще не заповнив</div>';

    // Pending list
    selectors.pendingList.innerHTML = stats.pendingList.length > 0
      ? stats.pendingList.map(p => `<div class="participant-item">⏳ ${p.name} — ${p.email}</div>`).join('')
      : '<div class="hint">Всі заповнили!</div>';

    // Responses list
    selectors.responsesList.innerHTML = responses.length > 0
      ? responses.map(r => `
          <div class="response-item">
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

fetchSession();
