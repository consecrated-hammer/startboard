const state = {
  settings: null,
  destinations: [],
  tab: null,
  duplicates: [],
  createdPage: null,
};

const elements = {
  message: document.getElementById('message'),
  setupView: document.getElementById('setupView'),
  readyView: document.getElementById('readyView'),
  successView: document.getElementById('successView'),
  baseUrlInput: document.getElementById('baseUrlInput'),
  tokenInput: document.getElementById('tokenInput'),
  testButton: document.getElementById('testButton'),
  saveConfigButton: document.getElementById('saveConfigButton'),
  resetButton: document.getElementById('resetButton'),
  pageSelect: document.getElementById('pageSelect'),
  groupSelect: document.getElementById('groupSelect'),
  descriptionInput: document.getElementById('descriptionInput'),
  saveBookmarkButton: document.getElementById('saveBookmarkButton'),
  tabTitle: document.getElementById('tabTitle'),
  tabUrl: document.getElementById('tabUrl'),
  duplicateBox: document.getElementById('duplicateBox'),
  duplicateList: document.getElementById('duplicateList'),
  successText: document.getElementById('successText'),
  openBoardLink: document.getElementById('openBoardLink'),
  saveAnotherButton: document.getElementById('saveAnotherButton'),
};

function normalizeBaseUrl(input) {
  const raw = (input || '').trim();
  if (!raw) return '';
  const url = new URL(raw);
  return url.origin;
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function loadSettings() {
  const stored = await chrome.storage.local.get(['baseUrl', 'token', 'lastPageId', 'lastGroupId']);
  return {
    baseUrl: stored.baseUrl || '',
    token: stored.token || '',
    lastPageId: stored.lastPageId || null,
    lastGroupId: stored.lastGroupId || null,
  };
}

async function saveSettings(next) {
  state.settings = { ...state.settings, ...next };
  await chrome.storage.local.set(state.settings);
}

function setMessage(text, kind = 'info') {
  if (!text) {
    elements.message.className = 'message hidden';
    elements.message.textContent = '';
    return;
  }
  elements.message.className = `message ${kind}`;
  elements.message.textContent = text;
}

function setView(name) {
  for (const [key, node] of Object.entries({
    setup: elements.setupView,
    ready: elements.readyView,
    success: elements.successView,
  })) {
    node.classList.toggle('hidden', key !== name);
  }
  elements.resetButton.classList.toggle('hidden', name === 'success');
}

async function api(path, options = {}) {
  const response = await fetch(`${state.settings.baseUrl}/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${state.settings.token}`,
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    let detail = 'Request failed';
    try {
      const payload = await response.json();
      detail = payload?.detail || detail;
    } catch {
      detail = `${response.status} ${response.statusText}`;
    }
    throw new Error(detail);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function testConnection(baseUrl, token) {
  const response = await fetch(`${baseUrl}/api/extension/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    let detail = 'Connection failed';
    try {
      const payload = await response.json();
      detail = payload?.detail || detail;
    } catch {
      detail = `${response.status} ${response.statusText}`;
    }
    throw new Error(detail);
  }
  return response.json();
}

function renderDestinations() {
  elements.pageSelect.innerHTML = '';
  for (const item of state.destinations) {
    const option = document.createElement('option');
    option.value = String(item.page.id);
    option.textContent = item.page.title;
    elements.pageSelect.appendChild(option);
  }
  const fallbackPageId = state.destinations.find((item) => item.page.id === state.settings.lastPageId)?.page.id
    || state.destinations[0]?.page.id
    || null;
  if (fallbackPageId != null) {
    elements.pageSelect.value = String(fallbackPageId);
  }
  renderGroups();
}

function renderGroups() {
  const selectedPageId = Number(elements.pageSelect.value || 0);
  const page = state.destinations.find((item) => item.page.id === selectedPageId);
  elements.groupSelect.innerHTML = '';
  for (const group of page?.groups || []) {
    const option = document.createElement('option');
    option.value = String(group.id);
    option.textContent = group.title;
    elements.groupSelect.appendChild(option);
  }
  const fallbackGroupId = page?.groups.find((group) => group.id === state.settings.lastGroupId)?.id
    || page?.groups[0]?.id
    || null;
  if (fallbackGroupId != null) {
    elements.groupSelect.value = String(fallbackGroupId);
  }
}

function renderDuplicates() {
  if (!state.duplicates.length) {
    elements.duplicateBox.classList.add('hidden');
    elements.duplicateList.innerHTML = '';
    return;
  }
  elements.duplicateBox.classList.remove('hidden');
  elements.duplicateList.innerHTML = '';
  for (const match of state.duplicates) {
    const li = document.createElement('li');
    li.textContent = `${match.page_title} / ${match.group_title} — ${match.bookmark.title}`;
    elements.duplicateList.appendChild(li);
  }
}

async function refreshDuplicates() {
  if (!state.tab?.url) return;
  try {
    const payload = await api(`/extension/duplicates?url=${encodeURIComponent(state.tab.url)}`);
    state.duplicates = payload.matches || [];
    renderDuplicates();
  } catch (error) {
    setMessage(error.message, 'error');
  }
}

async function loadReadyState() {
  state.destinations = (await api('/extension/destinations')).pages || [];
  if (!state.destinations.length) {
    throw new Error('No editable pages or groups are available for this account.');
  }
  state.tab = await getActiveTab();
  if (!state.tab?.url) {
    throw new Error('Could not read the current tab URL.');
  }
  elements.tabTitle.textContent = state.tab.title || state.tab.url;
  elements.tabUrl.textContent = state.tab.url;
  renderDestinations();
  await refreshDuplicates();
  setView('ready');
}

async function bootstrap() {
  state.settings = await loadSettings();
  elements.baseUrlInput.value = state.settings.baseUrl;
  elements.tokenInput.value = state.settings.token;
  if (!state.settings.baseUrl || !state.settings.token) {
    setView('setup');
    return;
  }
  try {
    await testConnection(state.settings.baseUrl, state.settings.token);
    await loadReadyState();
  } catch (error) {
    setMessage(error.message, 'error');
    setView('setup');
  }
}

elements.testButton.addEventListener('click', async () => {
  setMessage('');
  try {
    const baseUrl = normalizeBaseUrl(elements.baseUrlInput.value);
    const token = elements.tokenInput.value.trim();
    if (!baseUrl || !token) throw new Error('Enter both the Startboard URL and token first.');
    const payload = await testConnection(baseUrl, token);
    setMessage(`Connected to ${payload.site_name} as ${payload.user.display_name || payload.user.username}.`, 'success');
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

elements.saveConfigButton.addEventListener('click', async () => {
  setMessage('');
  try {
    const baseUrl = normalizeBaseUrl(elements.baseUrlInput.value);
    const token = elements.tokenInput.value.trim();
    if (!baseUrl || !token) throw new Error('Enter both the Startboard URL and token first.');
    await testConnection(baseUrl, token);
    await saveSettings({ baseUrl, token });
    await loadReadyState();
    setMessage('Setup saved.', 'success');
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

elements.pageSelect.addEventListener('change', () => {
  renderGroups();
});

elements.saveBookmarkButton.addEventListener('click', async () => {
  setMessage('');
  try {
    const groupId = Number(elements.groupSelect.value || 0);
    if (!groupId) throw new Error('Choose a destination group first.');
    const payload = await api('/extension/bookmarks', {
      method: 'POST',
      body: JSON.stringify({
        group_id: groupId,
        title: state.tab.title || state.tab.url,
        url: state.tab.url,
        description: elements.descriptionInput.value.trim() || null,
      }),
    });
    await saveSettings({
      lastPageId: Number(elements.pageSelect.value || 0),
      lastGroupId: groupId,
    });
    state.createdPage = payload.page;
    elements.successText.textContent = `Saved to ${payload.page.title} / ${payload.group.title}.`;
    elements.openBoardLink.href = `${state.settings.baseUrl}/p/${payload.page.id}`;
    setView('success');
    setMessage('');
  } catch (error) {
    setMessage(error.message, 'error');
  }
});

elements.saveAnotherButton.addEventListener('click', async () => {
  elements.descriptionInput.value = '';
  setMessage('');
  await loadReadyState();
});

elements.resetButton.addEventListener('click', async () => {
  await chrome.storage.local.remove(['baseUrl', 'token', 'lastPageId', 'lastGroupId']);
  state.settings = { baseUrl: '', token: '', lastPageId: null, lastGroupId: null };
  elements.baseUrlInput.value = '';
  elements.tokenInput.value = '';
  setMessage('Saved extension setup cleared.', 'info');
  setView('setup');
});

bootstrap().catch((error) => {
  setMessage(error.message, 'error');
  setView('setup');
});
