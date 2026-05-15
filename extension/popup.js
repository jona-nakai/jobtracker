const config = window.JOB_TRACKER_CONFIG;
const state = {
  session: null,
  groups: [],
  draft: null
};

const ids = {
  configView: 'config-view',
  authView: 'auth-view',
  collectView: 'collect-view',
  reviewView: 'review-view',
  sessionLabel: 'session-label',
  signOut: 'sign-out',
  message: 'message',
  email: 'email',
  password: 'password',
  groupId: 'group-id',
  roleTitle: 'role-title',
  company: 'company',
  externalLink: 'external-link',
  internalLink: 'internal-link',
  source: 'source',
  datePosted: 'date-posted',
  dateApplied: 'date-applied',
  workMode: 'work-mode',
  employmentType: 'employment-type',
  location: 'location',
  salary: 'salary',
  referrer: 'referrer',
  notes: 'notes',
  initialStatus: 'initial-status',
  collect: 'collect',
  cancelReview: 'cancel-review'
};

const $ = (key) => document.getElementById(ids[key]);
const today = () => {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
};
const DRAFT_KEY = 'roleDraft';

document.addEventListener('DOMContentLoaded', init);

async function init() {
  if (!config?.supabaseUrl || !config?.supabasePublishableKey) {
    showOnly('configView');
    return;
  }

  state.session = await storageGet('session');
  bindEvents();

  if (state.session?.access_token) {
    try {
      await loadGroups();
      state.draft = await storageGet(DRAFT_KEY);
      if (state.draft) {
        fillReviewForm(state.draft);
        showOnly('reviewView');
      } else {
        showCollect();
      }
    } catch {
      await storageSet('session', null);
      state.session = null;
      showOnly('authView');
    }
  } else {
    showOnly('authView');
  }
}

function bindEvents() {
  $( 'authView' ).addEventListener('submit', signIn);
  $( 'collect' ).addEventListener('click', collectFromLinkedIn);
  $( 'reviewView' ).addEventListener('submit', saveRole);
  $( 'reviewView' ).addEventListener('input', persistDraftFromForm);
  $( 'reviewView' ).addEventListener('change', persistDraftFromForm);
  $( 'cancelReview' ).addEventListener('click', async () => {
    state.draft = null;
    await storageSet(DRAFT_KEY, null);
    showCollect();
  });
  $( 'signOut' ).addEventListener('click', async () => {
    await storageSet('session', null);
    await storageSet(DRAFT_KEY, null);
    state.session = null;
    state.groups = [];
    showOnly('authView');
  });
}

async function signIn(event) {
  event.preventDefault();
  clearMessage();
  const response = await api('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: {
      email: $( 'email' ).value,
      password: $( 'password' ).value
    }
  }, false);

  state.session = response;
  await storageSet('session', response);
  await loadGroups();
  showCollect();
}

async function loadGroups() {
  const userId = state.session.user.id;
  let groups = await api(`/rest/v1/application_groups?select=*&user_id=eq.${userId}&order=created_at.asc`);
  if (!groups.length) {
    const created = await api('/rest/v1/application_groups?select=*', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: { user_id: userId, name: 'Job Search', notes: '' }
    });
    groups = created;
  }
  state.groups = groups;
  renderGroups();
}

function renderGroups() {
  $( 'groupId' ).innerHTML = '';
  state.groups.forEach((group) => {
    const option = document.createElement('option');
    option.value = group.group_id;
    option.textContent = group.name;
    $( 'groupId' ).append(option);
  });
}

async function collectFromLinkedIn() {
  clearMessage();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !isSupportedJobUrl(tab.url)) {
    showMessage('Open a selected LinkedIn or Indeed job before collecting.');
    return;
  }

  let response;
  try {
    response = await chrome.tabs.sendMessage(tab.id, { type: 'COLLECT_LINKEDIN_JOB' });
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['linkedinContent.js']
      });
      response = await chrome.tabs.sendMessage(tab.id, { type: 'COLLECT_LINKEDIN_JOB' });
    } catch {
      showMessage('Could not reach the job collector. Refresh the job page and try again.');
      return;
    }
  }
  if (!response?.ok) {
    showMessage(response?.error || 'Could not collect this job. Refresh the page and try again.');
    return;
  }
  const result = response.job;

  state.draft = {
    group_id: $( 'groupId' ).value || state.groups[0]?.group_id || '',
    role_title: result.role_title || '',
    company: result.company || '',
    external_link: result.external_link ?? tab.url ?? '',
    internal_link: result.internal_link || '',
    source: result.source || sourceFromUrl(tab.url),
    date_posted: result.date_posted || '',
    date_applied: today(),
    work_mode: normalizeWorkMode(result.work_mode),
    employment_type: normalizeEmploymentType(result.employment_type),
    location: result.location || '',
    salary: result.salary || '',
    referrer: '',
    notes: '',
    initial_status: 'Applied'
  };
  await storageSet(DRAFT_KEY, state.draft);
  fillReviewForm(state.draft);
  showOnly('reviewView');
}

function fillReviewForm(draft) {
  renderGroups();
  $( 'groupId' ).value = draft.group_id || state.groups[0]?.group_id || '';
  $( 'roleTitle' ).value = draft.role_title;
  $( 'company' ).value = draft.company;
  $( 'externalLink' ).value = draft.external_link;
  $( 'internalLink' ).value = draft.internal_link || '';
  $( 'source' ).value = draft.source;
  $( 'datePosted' ).value = draft.date_posted;
  $( 'dateApplied' ).value = draft.date_applied;
  $( 'workMode' ).value = draft.work_mode;
  $( 'employmentType' ).value = draft.employment_type;
  $( 'location' ).value = draft.location;
  $( 'salary' ).value = draft.salary;
  $( 'referrer' ).value = draft.referrer;
  $( 'notes' ).value = draft.notes;
  $( 'initialStatus' ).value = draft.initial_status;
}

async function persistDraftFromForm() {
  if ($( 'reviewView' ).classList.contains('hidden')) return;
  state.draft = {
    group_id: $( 'groupId' ).value,
    role_title: $( 'roleTitle' ).value,
    company: $( 'company' ).value,
    external_link: $( 'externalLink' ).value,
    internal_link: $( 'internalLink' ).value,
    source: $( 'source' ).value,
    date_posted: $( 'datePosted' ).value,
    date_applied: $( 'dateApplied' ).value,
    work_mode: $( 'workMode' ).value,
    employment_type: $( 'employmentType' ).value,
    location: $( 'location' ).value,
    salary: $( 'salary' ).value,
    referrer: $( 'referrer' ).value,
    notes: $( 'notes' ).value,
    initial_status: $( 'initialStatus' ).value
  };
  await storageSet(DRAFT_KEY, state.draft);
}

function isSupportedJobUrl(tabUrl) {
  try {
    const url = new URL(tabUrl);
    if (url.hostname === 'www.linkedin.com') {
      if (/^\/jobs\/view\/\d+\/?$/.test(url.pathname)) return true;
      return (url.pathname === '/jobs/search/' || url.pathname === '/jobs/search-results/') && Boolean(url.searchParams.get('currentJobId'));
    }
    if (url.hostname === 'www.indeed.com') {
      return url.pathname === '/' || url.pathname === '/jobs' || url.pathname === '/viewjob';
    }
    return false;
  } catch {
    return false;
  }
}

function sourceFromUrl(tabUrl) {
  try {
    const hostname = new URL(tabUrl).hostname;
    if (hostname === 'www.indeed.com') return 'Indeed';
    if (hostname === 'www.linkedin.com') return 'LinkedIn';
  } catch {
    return '';
  }
  return '';
}

async function saveRole(event) {
  event.preventDefault();
  clearMessage();
  const userId = state.session.user.id;
  const role = {
    user_id: userId,
    group_id: $( 'groupId' ).value,
    role_title: $( 'roleTitle' ).value.trim(),
    company: $( 'company' ).value.trim(),
    external_link: $( 'externalLink' ).value.trim(),
    source: $( 'source' ).value.trim(),
    internal_link: $( 'internalLink' ).value.trim(),
    date_posted: $( 'datePosted' ).value || null,
    date_applied: $( 'dateApplied' ).value,
    work_mode: $( 'workMode' ).value,
    employment_type: $( 'employmentType' ).value,
    location: $( 'location' ).value.trim(),
    referrer: $( 'referrer' ).value.trim(),
    salary: $( 'salary' ).value.trim(),
    notes: $( 'notes' ).value.trim()
  };

  const inserted = await api('/rest/v1/roles?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: role
  });

  await api('/rest/v1/status_history', {
    method: 'POST',
    body: {
      user_id: userId,
      role_id: inserted[0].role_id,
      status: $( 'initialStatus' ).value,
      changed_at: role.date_applied,
      notes: `Added from ${role.source || 'browser'} extension`
    }
  });

  state.draft = null;
  await storageSet(DRAFT_KEY, null);
  showCollect();
  showMessage('Saved to Job Tracker.');
}

async function api(path, options = {}, auth = true) {
  const headers = {
    apikey: config.supabasePublishableKey,
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (auth && state.session?.access_token) {
    headers.Authorization = `Bearer ${state.session.access_token}`;
  }

  const response = await fetch(`${config.supabaseUrl}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(payload?.msg || payload?.message || payload?.error_description || 'Request failed.');
  }
  return payload;
}

function normalizeWorkMode(value) {
  return ['Remote', 'Hybrid', 'In Person', 'Flexible', 'Unknown'].includes(value) ? value : 'Unknown';
}

function normalizeEmploymentType(value) {
  return ['Full Time', 'Part Time', 'Contract', 'Contract to Hire', 'Internship', 'Temporary', 'Freelance', 'Apprenticeship', 'Seasonal', 'Unknown'].includes(value) ? value : 'Unknown';
}

function showCollect() {
  $( 'sessionLabel' ).textContent = state.session?.user?.email || 'Signed in';
  $( 'signOut' ).classList.remove('hidden');
  showOnly('collectView');
}

function showOnly(key) {
  ['configView', 'authView', 'collectView', 'reviewView'].forEach((view) => $( view ).classList.add('hidden'));
  $( key ).classList.remove('hidden');
  if (key !== 'authView') $( 'authView' ).classList.add('hidden');
  if (key === 'authView') $( 'signOut' ).classList.add('hidden');
}

function showMessage(message) {
  $( 'message' ).textContent = message;
  $( 'message' ).classList.remove('hidden');
}

function clearMessage() {
  $( 'message' ).textContent = '';
  $( 'message' ).classList.add('hidden');
}

function storageGet(key) {
  return new Promise((resolve) => chrome.storage.local.get(key, (value) => resolve(value[key])));
}

function storageSet(key, value) {
  return new Promise((resolve) => chrome.storage.local.set({ [key]: value }, resolve));
}
