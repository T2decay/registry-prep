let studyQs = [];
let studyIdx = 0;
let studyCorrect = 0;
let studyWrong = 0;
let studyAnswers = [];

let testQs = [];
let testIdx = 0;
let testAnswers = [];
let testFlagged = [];
let testTimer = null;
let testSeconds = 0;
let testTimeLimitSeconds = 0;

let testReviewQs = [];
let testReviewResults = [];
let testReviewIdx = 0;
let testReviewReturnTo = 'test';

let flashcardDeck = [];
let flashcardIdx = 0;
let flashcardPhase = 'prompt';
let lastFlashcardSource = 'all';
let activeFlashDomain = 'All';
let activeFlashSub = 'All';
let flashcardSessionStats = null;

let reviewDeck = [];
let reviewIdx = 0;
let activeReviewDomain = 'All';
let activeReviewSub = 'All';
let reviewSessionStats = null;

let activeDomain = 'All';
let activeSub = 'All';
let activeStatusFilter = 'all';
let activeFlagFilter = 'all';
let pendingPresetMode = null;

const LETTERS = ['a', 'b', 'c', 'd'];
const TEST_TIME_LIMITS = {
  'mixed-25': 20 * 60,
  'mixed-50': 40 * 60,
  'mixed-100': 90 * 60,
  'arrt-200': 180 * 60,
  'domain': 60 * 60
};
const FLAG_TYPES = [
  'Review',
  'High Yield',
  'Need to Memorize',
  'Confusing',
  'Weak Area',
  'Got Lucky',
  'Revisit Later'
];
const STATUS_FILTERS = [
  { value: 'all', label: 'All Questions' },
  { value: 'flagged', label: 'Flagged Only' },
  { value: 'unflagged', label: 'Unflagged Only' },
  { value: 'attempted', label: 'Attempted' },
  { value: 'unattempted', label: 'Unattempted' },
  { value: 'missed', label: 'Missed Before' }
];
const STORAGE_KEYS = {
  progress: 'ms_progress',
  sessions: 'ms_sessions',
  themeMode: 'ms_theme_mode',
  themeAccent: 'ms_theme_accent',
  questionMeta: 'ms_question_meta',
  presets: 'ms_presets',
  studyOverviewCollapsed: 'ms_study_overview_collapsed',
  overviewCollapsedByView: 'ms_overview_collapsed_by_view'
};

function $(id) {
  return document.getElementById(id);
}

function normalizeText(value) {
  if (typeof value !== 'string') return value;
  if (/[Ââð]/.test(value)) {
    try {
      return decodeURIComponent(escape(value));
    } catch (error) {
      return value
        .replace(/Â·/g, '·')
        .replace(/â€”/g, '—')
        .replace(/â†’/g, '→')
        .replace(/â†/g, '←')
        .replace(/ðŸ“/g, '📝')
        .replace(/ðŸ“–/g, '📖')
        .replace(/Â°C/g, '°C');
    }
  }
  return value;
}

function normalizeQuestion(question) {
  return {
    ...question,
    domain: normalizeText(question.domain),
    subcategory: normalizeText(question.subcategory),
    spec: normalizeText(question.spec),
    stem: normalizeText(question.stem),
    options: question.options.map(normalizeText),
    rationale: normalizeText(question.rationale),
    reference: normalizeText(question.reference)
  };
}

const SAFE_QUESTIONS = typeof QUESTIONS !== 'undefined' ? QUESTIONS.map(normalizeQuestion) : [];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

function setDataFeedback(message, tone = 'neutral') {
  const node = $('data-feedback');
  if (!node) return;
  node.textContent = message;
  node.classList.remove('is-success', 'is-error');
  if (tone === 'success') node.classList.add('is-success');
  if (tone === 'error') node.classList.add('is-error');
}

function getProgress() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.progress) || '{}');
}

function saveProgress(data) {
  localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify(data));
}

function getSessions() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.sessions) || '[]');
}

function getQuestionMeta() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.questionMeta) || '{}');
}

function getPresets() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.presets) || '[]');
}

function saveQuestionMeta(data) {
  localStorage.setItem(STORAGE_KEYS.questionMeta, JSON.stringify(data));
}

function savePresets(data) {
  localStorage.setItem(STORAGE_KEYS.presets, JSON.stringify(data));
}

function getQuestionMetaEntry(qid) {
  const allMeta = getQuestionMeta();
  const entry = allMeta[qid] || {};
  return {
    flags: Array.isArray(entry.flags) ? entry.flags.filter((flag) => FLAG_TYPES.includes(flag)) : [],
    lastSeen: entry.lastSeen || null,
    confidence: entry.confidence || null,
    flashcardRating: entry.flashcardRating || null
  };
}

function updateQuestionMetaEntry(qid, updater) {
  const allMeta = getQuestionMeta();
  const current = getQuestionMetaEntry(qid);
  const next = updater(current);
  allMeta[qid] = {
    ...current,
    ...next,
    flags: Array.isArray(next.flags) ? next.flags.filter((flag) => FLAG_TYPES.includes(flag)) : current.flags
  };
  saveQuestionMeta(allMeta);
  return allMeta[qid];
}

function getQuestionFlags(qid) {
  return getQuestionMetaEntry(qid).flags;
}

function setQuestionLastSeen(qid) {
  updateQuestionMetaEntry(qid, (entry) => ({
    ...entry,
    lastSeen: new Date().toISOString()
  }));
}

function setQuestionConfidence(qid, confidence) {
  updateQuestionMetaEntry(qid, (entry) => ({
    ...entry,
    confidence
  }));
  renderConfidenceState(qid);
  loadDashboardIfVisible();
}

function setFlashcardRating(qid, flashcardRating) {
  updateQuestionMetaEntry(qid, (entry) => ({
    ...entry,
    flashcardRating
  }));
  renderFlashcardRatingState(qid);
}

function toggleQuestionFlag(qid, flag) {
  updateQuestionMetaEntry(qid, (entry) => ({
    ...entry,
    flags: entry.flags.includes(flag)
      ? entry.flags.filter((item) => item !== flag)
      : [...entry.flags, flag]
  }));
  refreshFilterControls();
  updateActiveQuestionSupport();
  loadDashboardIfVisible();
}

function getCorrectOptionText(question) {
  const idx = LETTERS.indexOf(question.correct);
  return idx >= 0 ? question.options[idx] : '';
}

function getWeakQuestions(pool = SAFE_QUESTIONS) {
  const progress = getProgress();
  return pool.filter((question) => {
    const item = progress[question.id];
    if (!item?.attempts) return false;
    const accuracy = item.correct / item.attempts;
    return item.attempts >= 2 ? accuracy < 0.7 : item.correct < item.attempts;
  });
}

function getQuestionWeaknessScore(question) {
  const progress = getProgress()[question.id];
  const meta = getQuestionMetaEntry(question.id);
  let score = 0;

  if (progress?.attempts) {
    const misses = progress.attempts - progress.correct;
    score += misses * 3;
    if (progress.correct / progress.attempts < 0.7) score += 2;
  }
  if (meta.flags.includes('Weak Area')) score += 4;
  if (meta.flags.includes('Confusing')) score += 2;
  if (meta.flags.includes('Need to Memorize')) score += 2;
  if (meta.confidence === 'Guessed') score += 2;
  if (meta.confidence === 'Unsure') score += 1;
  if (meta.flashcardRating === 'Missed') score += 3;
  if (meta.flashcardRating === 'Shaky') score += 2;

  return score;
}

function getWeakAreaInsights() {
  const bySub = {};
  const byDomain = {};

  SAFE_QUESTIONS.forEach((question) => {
    const score = getQuestionWeaknessScore(question);
    if (!bySub[question.subcategory]) bySub[question.subcategory] = { score: 0, count: 0, domain: question.domain };
    if (!byDomain[question.domain]) byDomain[question.domain] = { score: 0, count: 0 };
    bySub[question.subcategory].score += score;
    bySub[question.subcategory].count += 1;
    byDomain[question.domain].score += score;
    byDomain[question.domain].count += 1;
  });

  const subcategories = Object.entries(bySub)
    .map(([name, data]) => ({
      name,
      domain: data.domain,
      score: Math.round((data.score / Math.max(data.count, 1)) * 10) / 10
    }))
    .sort((a, b) => b.score - a.score);

  const domains = Object.entries(byDomain)
    .map(([name, data]) => ({
      name,
      score: Math.round((data.score / Math.max(data.count, 1)) * 10) / 10
    }))
    .sort((a, b) => b.score - a.score);

  return {
    topSubcategories: subcategories.filter((item) => item.score > 0).slice(0, 5),
    topDomains: domains.filter((item) => item.score > 0).slice(0, 4),
    strongestDomain: domains.length ? [...domains].reverse().find((item) => item.score >= 0) || domains[domains.length - 1] : null,
    weakestDomain: domains.find((item) => item.score > 0) || domains[0] || null
  };
}

function getWeakAreaPool() {
  const weakSubcategories = new Set(getWeakAreaInsights().topSubcategories.slice(0, 3).map((item) => item.name));
  return SAFE_QUESTIONS.filter((question) => weakSubcategories.has(question.subcategory));
}

function summarizeText(text, maxLength = 220) {
  const normalized = normalizeText(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function saveSession(session) {
  const sessions = getSessions();
  sessions.unshift(session);
  if (sessions.length > 50) sessions.length = 50;
  localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(sessions));
  updateHeroMetrics();
}

function getThemeSettings() {
  return {
    mode: localStorage.getItem(STORAGE_KEYS.themeMode) || 'dark',
    accent: localStorage.getItem(STORAGE_KEYS.themeAccent) || 'teal'
  };
}

function applyThemeSettings(mode, accent) {
  document.documentElement.setAttribute('data-theme', mode);
  document.documentElement.setAttribute('data-accent', accent);
  localStorage.setItem(STORAGE_KEYS.themeMode, mode);
  localStorage.setItem(STORAGE_KEYS.themeAccent, accent);
  syncSettingsUI();
}

function syncSettingsUI() {
  const { mode, accent } = getThemeSettings();
  document.querySelectorAll('[data-theme-mode]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.themeMode === mode);
  });
  document.querySelectorAll('[data-accent]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.accent === accent);
  });
}

function openSettings() {
  $('settings-panel').classList.remove('hidden');
  $('settings-overlay').classList.remove('hidden');
  $('settings-panel').setAttribute('aria-hidden', 'false');
  $('settings-trigger').setAttribute('aria-expanded', 'true');
  syncSettingsUI();
}

function closeSettings() {
  $('settings-panel').classList.add('hidden');
  $('settings-overlay').classList.add('hidden');
  $('settings-panel').setAttribute('aria-hidden', 'true');
  $('settings-trigger').setAttribute('aria-expanded', 'false');
}

function openPresetModal(mode) {
  pendingPresetMode = mode;
  const labels = {
    study: 'Save this Study setup so you can jump back into the same focus area later.',
    flashcards: 'Save this Flashcards setup for a fast repeat deck.',
    review: 'Save this Review setup so you can reopen the same concept stream later.'
  };
  $('preset-modal-copy').textContent = labels[mode] || 'Save this setup so you can launch it again later from the dashboard.';
  $('preset-name-input').value = '';
  $('preset-modal').classList.remove('hidden');
  $('preset-overlay').classList.remove('hidden');
  $('preset-modal').setAttribute('aria-hidden', 'false');
  setTimeout(() => $('preset-name-input').focus(), 0);
}

function closePresetModal() {
  pendingPresetMode = null;
  $('preset-modal').classList.add('hidden');
  $('preset-overlay').classList.add('hidden');
  $('preset-modal').setAttribute('aria-hidden', 'true');
}

function updateHeroMetrics() {
  const sessions = getSessions();
  const progress = getProgress();
  $('hero-total-questions').textContent = SAFE_QUESTIONS.length;
  $('hero-total-sessions').textContent = sessions.length;
  $('hero-total-attempted').textContent = Object.keys(progress).length;
  $('question-count-pill').textContent = `${SAFE_QUESTIONS.length} questions loaded`;
}

function getHeroOverviewViewKey() {
  const currentView = document.querySelector('.nav button.active')?.id?.replace('nav-', '') || 'study';
  const isStudySetup = currentView === 'study' && !$('study-setup').classList.contains('hidden');
  const isTestSetup = currentView === 'test' && !$('test-setup').classList.contains('hidden');
  if (isStudySetup) return 'study';
  if (isTestSetup) return 'test';
  if (currentView === 'dashboard') return 'dashboard';
  return null;
}

function getOverviewCollapsedMap() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.overviewCollapsedByView) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    return {};
  }
}

function getOverviewCollapsed(viewKey) {
  const state = getOverviewCollapsedMap();
  if (typeof state[viewKey] === 'boolean') return state[viewKey];
  if (viewKey === 'study') {
    const legacy = localStorage.getItem(STORAGE_KEYS.studyOverviewCollapsed);
    if (legacy === 'true') return true;
    if (legacy === 'false') return false;
  }
  return true;
}

function setOverviewCollapsed(viewKey, value) {
  const next = getOverviewCollapsedMap();
  next[viewKey] = Boolean(value);
  localStorage.setItem(STORAGE_KEYS.overviewCollapsedByView, JSON.stringify(next));
  if (viewKey === 'study') {
    localStorage.setItem(STORAGE_KEYS.studyOverviewCollapsed, String(Boolean(value)));
  }
}

function syncHeroOverviewState() {
  const currentView = document.querySelector('.nav button.active')?.id?.replace('nav-', '') || 'study';
  const isStudySetup = currentView === 'study' && !$('study-setup').classList.contains('hidden');
  const isTestSetup = currentView === 'test' && !$('test-setup').classList.contains('hidden');
  const viewKey = getHeroOverviewViewKey();
  const toggle = $('hero-overview-toggle');
  const panel = $('hero-overview-panel');
  const modeTitle = $('hero-mode-title');
  const modeNote = $('hero-mode-note');
  const collapsed = viewKey ? getOverviewCollapsed(viewKey) : true;

  toggle.classList.toggle('hidden', !viewKey);
  panel.classList.toggle('collapsed', Boolean(viewKey) && collapsed);
  $('hero-section').classList.toggle('hero-study-mode', isStudySetup);
  $('hero-section').classList.toggle('hero-test-mode', isTestSetup);
  $('hero-section').classList.toggle('hero-dashboard-mode', currentView === 'dashboard');

  toggle.textContent = collapsed ? 'Expand overview' : 'Collapse overview';
  toggle.setAttribute('aria-expanded', String(!collapsed));
  modeTitle.textContent = viewKey ? `${viewKey[0].toUpperCase() + viewKey.slice(1)} overview` : 'Study overview';
  modeNote.textContent = isStudySetup
    ? (collapsed ? 'Overview hidden for a faster return to study mode' : 'Quick orientation before you begin')
    : isTestSetup
      ? (collapsed ? 'Overview hidden to keep test setup cleaner' : 'Quick exam structure refresher before testing')
      : currentView === 'dashboard'
        ? (collapsed ? 'Overview hidden while you focus on progress and insights' : 'Reference the ARRT structure alongside your dashboard metrics')
        : 'Study overview is available from Study, Test, and Dashboard';
}

function updateHeroVisibility() {
  const currentView = document.querySelector('.nav button.active')?.id?.replace('nav-', '') || 'study';
  const showHero =
    currentView === 'dashboard' ||
    (currentView === 'study' && !$('study-setup').classList.contains('hidden')) ||
    (currentView === 'test' && !$('test-setup').classList.contains('hidden'));
  $('hero-section').classList.toggle('hidden', !showHero);
  syncHeroOverviewState();
}

function showView(view) {
  document.querySelectorAll('.nav button').forEach((button) => button.classList.remove('active'));
  $(`nav-${view}`).classList.add('active');
  ['study', 'flashcards', 'review', 'test', 'dashboard'].forEach((candidate) => {
    $(`view-${candidate}`).classList.toggle('hidden', candidate !== view);
  });
  if (view === 'dashboard') loadDashboard();
  updateHeroVisibility();
}

function renderFilterChip(container, label, count, value, onSelect, isActive) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `chip${isActive ? ' active' : ''}`;
  button.dataset.value = value;
  button.innerHTML = `${label}<span class="count">${count}</span>`;
  button.addEventListener('click', () => onSelect(value));
  container.appendChild(button);
}

function renderFocusSelect(selectId, options, currentValue) {
  const select = $(selectId);
  select.innerHTML = '';
  options.forEach((option) => {
    const el = document.createElement('option');
    el.value = option.value;
    el.textContent = option.label;
    if (option.value === currentValue) el.selected = true;
    select.appendChild(el);
  });
}

function getBaseStudyPool() {
  let pool = SAFE_QUESTIONS;
  if (activeDomain !== 'All') pool = pool.filter((q) => q.domain === activeDomain);
  if (activeSub !== 'All') pool = pool.filter((q) => q.subcategory === activeSub);
  return pool;
}

function applyDomainSubFilters(pool, domain, subcategory) {
  let nextPool = pool;
  if (domain !== 'All') nextPool = nextPool.filter((q) => q.domain === domain);
  if (subcategory !== 'All') nextPool = nextPool.filter((q) => q.subcategory === subcategory);
  return nextPool;
}

function renderSimpleSelect(selectId, values, currentValue) {
  const select = $(selectId);
  select.innerHTML = '';
  values.forEach(({ value, label }) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    if (value === currentValue) option.selected = true;
    select.appendChild(option);
  });
}

function buildDomainOptions(pool) {
  const counts = {};
  pool.forEach((q) => {
    counts[q.domain] = (counts[q.domain] || 0) + 1;
  });
  return [{ value: 'All', label: `All Domains (${pool.length})` }].concat(
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, label: `${value} (${count})` }))
  );
}

function buildSubOptions(pool, domain) {
  const filtered = domain === 'All' ? pool : pool.filter((q) => q.domain === domain);
  const counts = {};
  filtered.forEach((q) => {
    counts[q.subcategory] = (counts[q.subcategory] || 0) + 1;
  });
  return [{ value: 'All', label: `All Subcategories (${filtered.length})` }].concat(
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, label: `${value} (${count})` }))
  );
}

function matchesStatusFilter(question, status = activeStatusFilter) {
  const progress = getProgress()[question.id];
  const flags = getQuestionFlags(question.id);
  switch (status) {
    case 'flagged':
      return flags.length > 0;
    case 'unflagged':
      return flags.length === 0;
    case 'attempted':
      return Boolean(progress?.attempts);
    case 'unattempted':
      return !progress?.attempts;
    case 'missed':
      return Boolean(progress?.attempts) && progress.correct < progress.attempts;
    default:
      return true;
  }
}

function matchesFlagFilter(question, flag = activeFlagFilter) {
  if (flag === 'all') return true;
  return getQuestionFlags(question.id).includes(flag);
}

function getStatusCount(status, pool) {
  return pool.filter((question) => matchesStatusFilter(question, status)).length;
}

function getFlagCount(flag, pool) {
  if (flag === 'all') return pool.length;
  return pool.filter((question) => matchesFlagFilter(question, flag)).length;
}

function refreshFilterControls() {
  const basePool = getBaseStudyPool();
  renderFocusSelect(
    'study-status-filter',
    STATUS_FILTERS.map((status) => ({
      value: status.value,
      label: `${status.label} (${getStatusCount(status.value, basePool)})`
    })),
    activeStatusFilter
  );
  renderFocusSelect(
    'study-flag-filter',
    [{ value: 'all', label: `Any Flag (${basePool.length})` }].concat(
      FLAG_TYPES.map((flag) => ({
        value: flag,
        label: `${flag} (${getFlagCount(flag, basePool)})`
      }))
    ),
    activeFlagFilter
  );
  updateAvailable();
  if ($('flashcard-available-count')) updateFlashcardAvailable();
  if ($('review-available-count')) updateReviewAvailable();
}

function initFilters() {
  const domains = {};
  SAFE_QUESTIONS.forEach((q) => {
    domains[q.domain] = (domains[q.domain] || 0) + 1;
  });

  const domainFilters = $('domain-filters');
  domainFilters.innerHTML = '';
  renderFilterChip(domainFilters, 'All', SAFE_QUESTIONS.length, 'All', setDomain, activeDomain === 'All');
  Object.entries(domains)
    .sort((a, b) => b[1] - a[1])
    .forEach(([domain, count]) => {
      renderFilterChip(domainFilters, domain, count, domain, setDomain, domain === activeDomain);
    });

  updateSubFilters();
  refreshFilterControls();
}

function setDomain(domain) {
  activeDomain = domain;
  activeSub = 'All';
  document.querySelectorAll('#domain-filters .chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.value === domain);
  });
  updateSubFilters();
  refreshFilterControls();
}

function updateSubFilters() {
  const subcategories = {};
  const pool = activeDomain === 'All' ? SAFE_QUESTIONS : SAFE_QUESTIONS.filter((q) => q.domain === activeDomain);
  pool.forEach((q) => {
    subcategories[q.subcategory] = (subcategories[q.subcategory] || 0) + 1;
  });

  const subFilters = $('sub-filters');
  subFilters.innerHTML = '';
  renderFilterChip(subFilters, 'All', pool.length, 'All', setSub, activeSub === 'All');
  Object.entries(subcategories)
    .sort((a, b) => b[1] - a[1])
    .forEach(([subcategory, count]) => {
      renderFilterChip(subFilters, subcategory, count, subcategory, setSub, subcategory === activeSub);
    });
}

function setSub(subcategory) {
  activeSub = subcategory;
  document.querySelectorAll('#sub-filters .chip').forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.value === subcategory);
  });
  refreshFilterControls();
}

function getFilteredPool() {
  return getBaseStudyPool()
    .filter((q) => matchesStatusFilter(q))
    .filter((q) => matchesFlagFilter(q));
}

function getPoolBySource(source) {
  switch (source) {
    case 'filtered':
      return getFilteredPool();
    case 'flagged':
      return SAFE_QUESTIONS.filter((question) => getQuestionFlags(question.id).length > 0);
    case 'missed':
      return SAFE_QUESTIONS.filter((question) => matchesStatusFilter(question, 'missed'));
    case 'weak':
      return getWeakAreaPool().length ? getWeakAreaPool() : getWeakQuestions();
    case 'high-yield':
      return SAFE_QUESTIONS.filter((question) => getQuestionFlags(question.id).includes('High Yield'));
    default:
      return SAFE_QUESTIONS;
  }
}

function getFlashcardSourcePool() {
  return applyDomainSubFilters(getPoolBySource($('flashcard-source').value), activeFlashDomain, activeFlashSub);
}

function getReviewSourcePool() {
  return applyDomainSubFilters(getPoolBySource($('review-source').value), activeReviewDomain, activeReviewSub);
}

function describeSource(source) {
  switch (source) {
    case 'filtered':
      return 'Filtered';
    case 'flagged':
      return 'Flagged';
    case 'missed':
      return 'Missed';
    case 'weak':
      return 'Weak Areas';
    case 'high-yield':
      return 'High Yield';
    default:
      return 'All Questions';
  }
}

function getSuggestedNextAction() {
  const insights = getWeakAreaInsights();
  const topWeak = insights.topSubcategories[0];
  if (topWeak) return `Next best action: review ${topWeak.domain} → ${topWeak.name}.`;
  if (SAFE_QUESTIONS.some((question) => getQuestionFlags(question.id).length > 0)) return 'Next best action: launch a flagged flashcard deck.';
  return 'Next best action: keep building momentum with a focused study session.';
}

function summarizePreset(preset) {
  if (preset.mode === 'study') {
    const pieces = [preset.config.domain || 'All domains'];
    if (preset.config.subcategory && preset.config.subcategory !== 'All') pieces.push(preset.config.subcategory);
    if (preset.config.status && preset.config.status !== 'all') pieces.push(preset.config.status);
    if (preset.config.flag && preset.config.flag !== 'all') pieces.push(preset.config.flag);
    pieces.push(`${preset.config.count || '25'} questions`);
    if (preset.config.shuffle === false) pieces.push('linear');
    return pieces.join(' | ');
  }
  if (preset.mode === 'flashcards') {
    const pieces = [describeSource(preset.config.source || 'all')];
    if (preset.config.domain && preset.config.domain !== 'All') pieces.push(preset.config.domain);
    if (preset.config.subcategory && preset.config.subcategory !== 'All') pieces.push(preset.config.subcategory);
    pieces.push(`${preset.config.count || '25'} cards`);
    if (preset.config.shuffle !== false) pieces.push('shuffled');
    return pieces.join(' | ');
  }
  const pieces = [describeSource(preset.config.source || 'filtered')];
  if (preset.config.domain && preset.config.domain !== 'All') pieces.push(preset.config.domain);
  if (preset.config.subcategory && preset.config.subcategory !== 'All') pieces.push(preset.config.subcategory);
  pieces.push(`${preset.config.count || '10'} cards`);
  if (preset.config.shuffle) pieces.push('shuffled');
  return pieces.join(' | ');
}

function buildPresetConfig(mode) {
  if (mode === 'study') {
    return {
      domain: activeDomain,
      subcategory: activeSub,
      status: activeStatusFilter,
      flag: activeFlagFilter,
      count: $('study-count').value,
      shuffle: $('study-shuffle').checked
    };
  }
  if (mode === 'flashcards') {
    return {
      source: $('flashcard-source').value,
      count: $('flashcard-count').value,
      domain: activeFlashDomain,
      subcategory: activeFlashSub,
      shuffle: $('flashcard-shuffle').checked
    };
  }
  if (mode === 'review') {
    return {
      source: $('review-source').value,
      count: $('review-count').value,
      domain: activeReviewDomain,
      subcategory: activeReviewSub,
      shuffle: $('review-shuffle').checked
    };
  }
  return null;
}

function savePreset(mode) {
  openPresetModal(mode);
}

function confirmSavePreset() {
  const mode = pendingPresetMode;
  const name = $('preset-name-input').value.trim();
  if (!mode || !name) {
    showToast('Enter a preset name first.');
    return;
  }

  const config = buildPresetConfig(mode);
  const presets = getPresets().filter((preset) => preset.name.toLowerCase() !== name.toLowerCase());
  presets.unshift({ id: `preset_${Date.now()}`, name, mode, config });
  savePresets(presets.slice(0, 25));
  closePresetModal();
  loadDashboardIfVisible();
  setDataFeedback(`Saved preset "${name}" locally.`, 'success');
  showToast(`Saved preset: ${name}`);
}

function applyPreset(preset) {
  if (preset.mode === 'study') {
    showView('study');
    showStudySetup();
    activeDomain = preset.config.domain || 'All';
    activeSub = preset.config.subcategory || 'All';
    activeStatusFilter = preset.config.status || 'all';
    activeFlagFilter = preset.config.flag || 'all';
    $('study-count').value = preset.config.count || '25';
    $('study-shuffle').checked = preset.config.shuffle !== false;
    initFilters();
    return;
  }

  if (preset.mode === 'flashcards') {
    showView('flashcards');
    $('flashcard-active').classList.add('hidden');
    $('flashcard-summary').classList.add('hidden');
    $('flashcard-setup').classList.remove('hidden');
    $('flashcard-source').value = preset.config.source || 'all';
    $('flashcard-count').value = preset.config.count || '25';
    $('flashcard-shuffle').checked = preset.config.shuffle !== false;
    activeFlashDomain = preset.config.domain || 'All';
    activeFlashSub = preset.config.subcategory || 'All';
    updateFlashcardAvailable();
    return;
  }

  if (preset.mode === 'review') {
    showView('review');
    $('review-active').classList.add('hidden');
    $('review-summary').classList.add('hidden');
    $('review-setup').classList.remove('hidden');
    $('review-source').value = preset.config.source || 'filtered';
    $('review-count').value = preset.config.count || '10';
    $('review-shuffle').checked = preset.config.shuffle === true;
    activeReviewDomain = preset.config.domain || 'All';
    activeReviewSub = preset.config.subcategory || 'All';
    updateReviewAvailable();
  }
}

function deletePreset(id) {
  if (!confirm('Delete this saved preset?')) return;
  savePresets(getPresets().filter((preset) => preset.id !== id));
  loadDashboardIfVisible();
  setDataFeedback('Preset removed from this browser.', 'success');
  showToast('Preset deleted');
}

function applyPresetById(id) {
  const preset = getPresets().find((item) => item.id === id);
  if (!preset) return;
  applyPreset(preset);
  setDataFeedback(`Loaded preset "${preset.name}".`, 'success');
  showToast(`Loaded preset: ${preset.name}`);
}

function exportAllData() {
  const payload = {
    exportedAt: new Date().toISOString(),
    version: 1,
    data: {
      progress: getProgress(),
      sessions: getSessions(),
      questionMeta: getQuestionMeta(),
      presets: getPresets(),
      themeMode: localStorage.getItem(STORAGE_KEYS.themeMode) || 'dark',
      themeAccent: localStorage.getItem(STORAGE_KEYS.themeAccent) || 'teal'
    }
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'mri-registry-prep-backup.json';
  link.click();
  URL.revokeObjectURL(url);
  setDataFeedback('Backup exported. Keep the JSON file somewhere safe so you can restore it later.', 'success');
  showToast('Backup exported');
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeImportedData(data) {
  if (!isPlainObject(data)) throw new Error('Invalid backup format');
  return {
    progress: isPlainObject(data.progress) ? data.progress : {},
    sessions: Array.isArray(data.sessions) ? data.sessions : [],
    questionMeta: isPlainObject(data.questionMeta) ? data.questionMeta : {},
    presets: Array.isArray(data.presets) ? data.presets.filter((preset) => preset && typeof preset.name === 'string' && typeof preset.mode === 'string') : [],
    themeMode: typeof data.themeMode === 'string' ? data.themeMode : null,
    themeAccent: typeof data.themeAccent === 'string' ? data.themeAccent : null
  };
}

function importAllData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(reader.result);
      const data = normalizeImportedData(payload?.data);
      localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify(data.progress));
      localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(data.sessions));
      localStorage.setItem(STORAGE_KEYS.questionMeta, JSON.stringify(data.questionMeta));
      localStorage.setItem(STORAGE_KEYS.presets, JSON.stringify(data.presets));
      if (data.themeMode) localStorage.setItem(STORAGE_KEYS.themeMode, data.themeMode);
      if (data.themeAccent) localStorage.setItem(STORAGE_KEYS.themeAccent, data.themeAccent);
      initFilters();
      loadDashboard();
      updateHeroMetrics();
      applyThemeSettings(getThemeSettings().mode, getThemeSettings().accent);
      setDataFeedback('Backup imported successfully. Your local progress and settings are now restored in this browser.', 'success');
      showToast('Progress imported');
    } catch (error) {
      setDataFeedback('Import failed. Choose a backup JSON exported from this app and try again.', 'error');
      showToast('Import failed: invalid file');
    }
  };
  reader.readAsText(file);
}

function updateAvailable() {
  const count = getFilteredPool().length;
  $('available-count').textContent = `${count} questions available`;
}

function startStudyWithPool(pool) {
  if (!pool.length) {
    alert('No questions match your filters.');
    return;
  }

  let count = parseInt($('study-count').value, 10);
  if (count === 0) count = pool.length;

  const shouldShuffle = $('study-shuffle').checked;
  studyQs = (shouldShuffle ? shuffle(pool) : [...pool]).slice(0, Math.min(count, pool.length));
  studyIdx = 0;
  studyCorrect = 0;
  studyWrong = 0;
  studyAnswers = [];

  $('study-setup').classList.add('hidden');
  $('study-summary').classList.add('hidden');
  $('study-active').classList.remove('hidden');
  updateHeroVisibility();
  renderStudyQ();
}

function startStudy() {
  startStudyWithPool(getFilteredPool());
}

function startFlaggedReview() {
  const pool = getBaseStudyPool()
    .filter((question) => getQuestionFlags(question.id).length > 0)
    .filter((question) => matchesFlagFilter(question));
  if (!pool.length) {
    showToast('No flagged questions match this focus.');
    return;
  }
  startStudyWithPool(pool);
}

function buildGoogleSearchUrl(question) {
  const query = [
    question.stem,
    question.domain,
    question.subcategory,
    'MRI registry prep'
  ].join(' ');
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function buildChatGPTPrompt(question) {
  return [
    'I am studying for the MRI registry exam. Please help me understand this concept clearly without oversimplifying it.',
    `Domain: ${question.domain}`,
    `Subcategory: ${question.subcategory}`,
    `Question: ${question.stem}`,
    `Correct answer: ${question.correct.toUpperCase()}. ${getCorrectOptionText(question)}`,
    `Rationale: ${question.rationale}`,
    'Please do the following:',
    '1. Explain the core concept being tested.',
    '2. Explain why the correct answer is right.',
    '3. Briefly explain why the other options are less correct or incorrect.',
    '4. Give one short memory tip or mnemonic.',
    '5. Keep it exam-focused and educational.'
  ].join('\n');
}

function buildChatGPTUrl(question) {
  return `https://chatgpt.com/?q=${encodeURIComponent(buildChatGPTPrompt(question))}`;
}

function renderFlagPanel(qid) {
  const row = $('flag-chip-row');
  const activeFlags = new Set(getQuestionFlags(qid));
  row.innerHTML = '';
  FLAG_TYPES.forEach((flag) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `flag-chip${activeFlags.has(flag) ? ' active' : ''}`;
    button.textContent = flag;
    button.addEventListener('click', () => toggleQuestionFlag(qid, flag));
    row.appendChild(button);
  });
}

function renderFlagPreview(qid) {
  const preview = $('active-flag-preview');
  const flags = getQuestionFlags(qid);
  $('toggle-flags-btn').classList.toggle('has-flags', flags.length > 0);
  preview.innerHTML = '';
  if (!flags.length) {
    preview.innerHTML = '<span class="inline-note">No flags yet</span>';
    return;
  }
  flags.forEach((flag) => {
    const chip = document.createElement('span');
    chip.className = 'mini-flag';
    chip.textContent = flag;
    preview.appendChild(chip);
  });
}

function renderConfidenceState(qid) {
  const confidence = getQuestionMetaEntry(qid).confidence;
  document.querySelectorAll('.confidence-btn').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.confidence === confidence);
  });
}

function updateActiveQuestionSupport() {
  const q = studyQs[studyIdx];
  if (!q) return;
  renderFlagPanel(q.id);
  renderFlagPreview(q.id);
  $('help-search-btn').onclick = () => {
    window.open(buildGoogleSearchUrl(q), '_blank', 'noopener');
  };
  $('ask-chatgpt-btn').onclick = () => {
    window.open(buildChatGPTUrl(q), '_blank', 'noopener');
  };
}

function renderStudyQ() {
  const q = studyQs[studyIdx];
  setQuestionLastSeen(q.id);
  $('s-qid').textContent = `${q.id} · ${q.domain}`;
  $('s-spec').textContent = `ARRT ${q.spec} · ${q.subcategory}`;
  $('s-stem').textContent = q.stem;
  $('s-progress').textContent = `${studyIdx + 1}/${studyQs.length}`;

  const totalAnswered = studyCorrect + studyWrong;
  $('s-correct').textContent = studyCorrect;
  $('s-wrong').textContent = studyWrong;
  $('s-pct').textContent = totalAnswered ? `${Math.round((studyCorrect / totalAnswered) * 100)}%` : '—';

  const options = $('s-options');
  options.innerHTML = '';
  q.options.forEach((opt, index) => {
    const button = document.createElement('button');
    button.className = 'option-btn';
    button.innerHTML = `<span class="letter">${LETTERS[index].toUpperCase()}</span><span>${opt}</span>`;
    button.onclick = () => answerStudy(LETTERS[index], button);
    options.appendChild(button);
  });

  $('s-rationale').classList.add('hidden');
  $('s-rationale').innerHTML = '';
  $('confidence-panel').classList.add('hidden');
  $('ask-chatgpt-btn').classList.remove('hidden');
  $('s-next').classList.add('hidden');
  $('flag-panel').classList.add('hidden');
  $('toggle-flags-btn').classList.remove('is-open');
  updateActiveQuestionSupport();
}

function answerStudy(letter, clickedBtn) {
  const q = studyQs[studyIdx];
  const isCorrect = letter === q.correct;

  document.querySelectorAll('#s-options .option-btn').forEach((button, index) => {
    button.classList.add('locked');
    if (LETTERS[index] === q.correct) button.classList.add('correct');
  });

  if (!isCorrect) clickedBtn.classList.add('wrong');

  if (isCorrect) studyCorrect += 1;
  else studyWrong += 1;

  studyAnswers.push({
    qid: q.id,
    given: letter,
    correct: q.correct,
    right: isCorrect,
    sub: q.subcategory,
    domain: q.domain
  });

  const totalAnswered = studyCorrect + studyWrong;
  $('s-correct').textContent = studyCorrect;
  $('s-wrong').textContent = studyWrong;
  $('s-pct').textContent = `${Math.round((studyCorrect / totalAnswered) * 100)}%`;

  const rationale = $('s-rationale');
  rationale.innerHTML = `<div class="rationale-box"><div>${q.rationale}</div><div class="ref">${q.reference}</div></div>`;
  rationale.classList.remove('hidden');
  $('confidence-panel').classList.remove('hidden');
  renderConfidenceState(q.id);

  const progress = getProgress();
  if (!progress[q.id]) progress[q.id] = { attempts: 0, correct: 0 };
  progress[q.id].attempts += 1;
  if (isCorrect) progress[q.id].correct += 1;
  saveProgress(progress);
  updateHeroMetrics();
  refreshFilterControls();
  loadDashboardIfVisible();

  if (studyIdx < studyQs.length - 1) {
    $('s-next').classList.remove('hidden');
  } else {
    setTimeout(() => endStudy(), 900);
  }
}

function nextStudyQ() {
  studyIdx += 1;
  renderStudyQ();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function endStudy() {
  const total = studyCorrect + studyWrong;
  saveSession({
    type: 'study',
    date: new Date().toISOString(),
    total,
    correct: studyCorrect,
    pct: total ? Math.round((studyCorrect / total) * 100) : 0,
    domain: activeDomain,
    sub: activeSub,
    answers: studyAnswers
  });

  $('study-active').classList.add('hidden');
  $('study-summary').classList.remove('hidden');
  updateHeroVisibility();
  renderStudySummary();
}

function showStudySetup() {
  $('study-summary').classList.add('hidden');
  $('study-active').classList.add('hidden');
  $('study-setup').classList.remove('hidden');
  updateHeroVisibility();
}

function renderStudySummary() {
  const total = studyCorrect + studyWrong;
  const pct = total ? Math.round((studyCorrect / total) * 100) : 0;
  $('sum-stats').innerHTML = `
    <div class="stat-card"><div class="val">${total}</div><div class="label">Questions</div></div>
    <div class="stat-card"><div class="val" style="color:var(--correct)">${studyCorrect}</div><div class="label">Correct</div></div>
    <div class="stat-card"><div class="val" style="color:var(--wrong)">${studyWrong}</div><div class="label">Wrong</div></div>
    <div class="stat-card"><div class="val" style="color:var(--gold)">${pct}%</div><div class="label">Score</div></div>
  `;
  const touched = [...new Set(studyAnswers.map((answer) => answer.sub))].slice(0, 2).join(' • ');
  $('study-summary-insight').textContent = `Completed ${total} questions at ${pct}% accuracy.${touched ? ` Focus touched: ${touched}.` : ''} ${getSuggestedNextAction()}`;

  const bySub = {};
  studyAnswers.forEach((answer) => {
    if (!bySub[answer.sub]) bySub[answer.sub] = { c: 0, t: 0 };
    bySub[answer.sub].t += 1;
    if (answer.right) bySub[answer.sub].c += 1;
  });

  const tbody = document.querySelector('#sum-table tbody');
  tbody.innerHTML = '';
  Object.entries(bySub)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([sub, data]) => {
      const score = Math.round((data.c / data.t) * 100);
      const cls = score >= 75 ? 'right' : 'wrong-text';
      tbody.innerHTML += `<tr><td>${sub}</td><td>${data.c}</td><td>${data.t}</td><td class="${cls}">${score}%</td></tr>`;
    });
}

function reviewMissed() {
  const missed = studyAnswers.filter((answer) => !answer.right);
  if (!missed.length) {
    showToast('No missed questions to review.');
    return;
  }
  studyQs = missed.map((answer) => SAFE_QUESTIONS.find((q) => q.id === answer.qid)).filter(Boolean);
  studyIdx = 0;
  studyCorrect = 0;
  studyWrong = 0;
  studyAnswers = [];
  $('study-summary').classList.add('hidden');
  $('study-active').classList.remove('hidden');
  updateHeroVisibility();
  renderStudyQ();
}

function updateTestInfo() {
  $('test-domain-pick').classList.toggle('hidden', $('test-type').value !== 'domain');
}

function startTest() {
  const type = $('test-type').value;
  let pool;
  let count;

  if (type === 'domain') {
    const domain = $('test-domain').value;
    pool = shuffle(SAFE_QUESTIONS.filter((q) => q.domain === domain));
    count = Math.min(50, pool.length);
  } else if (type === 'arrt-200') {
    pool = buildARRTMock();
    count = pool.length;
  } else {
    count = parseInt(type.split('-')[1], 10);
    pool = shuffle([...SAFE_QUESTIONS]);
  }

  testQs = pool.slice(0, count);
  testIdx = 0;
  testAnswers = new Array(testQs.length).fill(null);
  testFlagged = new Array(testQs.length).fill(false);
  testSeconds = 0;
  testTimeLimitSeconds = TEST_TIME_LIMITS[type] || 0;

  $('test-setup').classList.add('hidden');
  $('test-summary').classList.add('hidden');
  $('test-active').classList.remove('hidden');
  updateHeroVisibility();

  if (testTimer) clearInterval(testTimer);
  if ($('test-timer-on').checked) {
    $('t-timer').textContent = '00:00';
    updateCountdownDisplay();
    testTimer = setInterval(() => {
      testSeconds += 1;
      const minutes = Math.floor(testSeconds / 60);
      const seconds = testSeconds % 60;
      $('t-timer').textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      updateCountdownDisplay();
    }, 1000);
  } else {
    testTimer = null;
    $('t-timer').textContent = '—';
    $('t-countdown').textContent = '';
  }

  buildNavGrid();
  renderTestQ();
}

function buildARRTMock() {
  const targets = [
    { domain: 'Patient Care', n: 16 },
    { domain: 'Safety', n: 21 },
    { domain: 'Image Production', n: 106 },
    { domain: 'Procedures', n: 57 }
  ];

  let mock = [];
  targets.forEach((target) => {
    const pool = shuffle(SAFE_QUESTIONS.filter((q) => q.domain === target.domain));
    mock = mock.concat(pool.slice(0, Math.min(target.n, pool.length)));
  });
  return shuffle(mock);
}

function renderTestQ() {
  const q = testQs[testIdx];
  setQuestionLastSeen(q.id);
  $('t-qid').textContent = `${q.id} · ${q.domain}`;
  $('t-stem').textContent = q.stem;
  $('t-progress').textContent = `${testIdx + 1}/${testQs.length}`;
  $('t-answered').textContent = testAnswers.filter((answer) => answer !== null).length;

  $('t-prev').disabled = testIdx === 0;
  $('t-next').textContent = testIdx === testQs.length - 1 ? 'Review' : 'Next →';

  const isFlagged = testFlagged[testIdx];
  const flagBtn = $('t-flag');
  flagBtn.textContent = isFlagged ? '☑ Flagged' : '☐ Flag for Review';
  flagBtn.classList.toggle('is-flagged', isFlagged);

  const options = $('t-options');
  options.innerHTML = '';
  q.options.forEach((opt, index) => {
    const button = document.createElement('button');
    button.className = 'option-btn';
    if (testAnswers[testIdx] === LETTERS[index]) button.classList.add('is-selected');
    button.innerHTML = `<span class="letter">${LETTERS[index].toUpperCase()}</span><span>${opt}</span>`;
    button.onclick = () => {
      testAnswers[testIdx] = LETTERS[index];
      renderTestQ();
      updateNavGrid();
    };
    options.appendChild(button);
  });
  updateNavGrid();
}

function testNav(dir) {
  testIdx += dir;
  if (testIdx < 0) testIdx = 0;
  if (testIdx >= testQs.length) testIdx = testQs.length - 1;
  renderTestQ();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function buildNavGrid() {
  const grid = $('t-nav-grid');
  grid.innerHTML = '';
  testQs.forEach((q, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = String(index + 1);
    button.onclick = () => {
      testIdx = index;
      renderTestQ();
    };
    grid.appendChild(button);
  });
  updateNavGrid();
}

function updateNavGrid() {
  const buttons = document.querySelectorAll('#t-nav-grid button');
  buttons.forEach((button, index) => {
    button.classList.toggle('is-answered', testAnswers[index] !== null);
    button.classList.toggle('is-current', index === testIdx);
    button.classList.toggle('is-flagged', testFlagged[index] === true);
  });
}

function submitTest() {
  const unanswered = testAnswers.filter((answer) => answer === null).length;
  const flagged = testFlagged.filter(Boolean).length;
  let confirmMsg = '';
  if (unanswered > 0) confirmMsg += `${unanswered} unanswered question${unanswered > 1 ? 's' : ''}`;
  if (flagged > 0) confirmMsg += `${confirmMsg ? ' and ' : ''}${flagged} flagged for review`;
  if (confirmMsg && !confirm(`You have ${confirmMsg}. Submit anyway?`)) {
    return;
  }

  if (testTimer) {
    clearInterval(testTimer);
    testTimer = null;
  }

  let correct = 0;
  const results = testQs.map((q, index) => {
    const given = testAnswers[index];
    const right = given === q.correct;
    if (right) correct += 1;
    return { qid: q.id, given, correct: q.correct, right, sub: q.subcategory, domain: q.domain };
  });

  const total = testQs.length;
  const pct = Math.round((correct / total) * 100);

  const progress = getProgress();
  results.forEach((result) => {
    if (!progress[result.qid]) progress[result.qid] = { attempts: 0, correct: 0 };
    progress[result.qid].attempts += 1;
    if (result.right) progress[result.qid].correct += 1;
  });
  saveProgress(progress);
  updateHeroMetrics();
  refreshFilterControls();
  loadDashboardIfVisible();

  saveSession({
    type: 'test',
    date: new Date().toISOString(),
    total,
    correct,
    pct,
    time: testSeconds,
    answers: results
  });

  $('test-active').classList.add('hidden');
  $('test-summary').classList.remove('hidden');
  updateHeroVisibility();

  const pass = pct >= 75;
  $('t-sum-stats').innerHTML = `
    <div class="stat-card"><div class="val">${total}</div><div class="label">Questions</div></div>
    <div class="stat-card"><div class="val" style="color:var(--correct)">${correct}</div><div class="label">Correct</div></div>
    <div class="stat-card"><div class="val" style="color:${pass ? 'var(--correct)' : 'var(--wrong)'}">${pct}%</div><div class="label">${pass ? 'PASS' : 'NEEDS WORK'}</div></div>
    <div class="stat-card"><div class="val" style="color:var(--gold)">${Math.floor(testSeconds / 60)}:${String(testSeconds % 60).padStart(2, '0')}</div><div class="label">Time</div></div>
  `;
  const weakTouched = [...new Set(results.filter((item) => !item.right).map((item) => item.sub))].slice(0, 2).join(' • ');
  $('test-summary-insight').textContent = `Completed ${total} test questions at ${pct}% accuracy.${weakTouched ? ` Misses clustered in: ${weakTouched}.` : ''} ${getSuggestedNextAction()}`;

  const bySub = {};
  results.forEach((result) => {
    if (!bySub[result.sub]) bySub[result.sub] = { c: 0, t: 0 };
    bySub[result.sub].t += 1;
    if (result.right) bySub[result.sub].c += 1;
  });

  const tbody = document.querySelector('#t-sum-table tbody');
  tbody.innerHTML = '';
  Object.entries(bySub)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([sub, data]) => {
      const score = data.t ? Math.round((data.c / data.t) * 100) : 0;
      const cls = score >= 75 ? 'right' : 'wrong-text';
      tbody.innerHTML += `<tr><td>${sub}</td><td>${data.c}</td><td>${data.t}</td><td class="${cls}">${score}%</td></tr>`;
    });

  window._lastTestResults = results;
}

function reviewTestMissed() {
  const missed = (window._lastTestResults || []).filter((answer) => !answer.right);
  if (!missed.length) {
    showToast('No missed questions to review.');
    return;
  }
  showView('study');
  studyQs = missed.map((answer) => SAFE_QUESTIONS.find((q) => q.id === answer.qid)).filter(Boolean);
  studyIdx = 0;
  studyCorrect = 0;
  studyWrong = 0;
  studyAnswers = [];
  $('study-setup').classList.add('hidden');
  $('study-summary').classList.add('hidden');
  $('study-active').classList.remove('hidden');
  updateHeroVisibility();
  renderStudyQ();
}

function showTestSetup() {
  $('test-summary').classList.add('hidden');
  $('test-active').classList.add('hidden');
  $('test-review').classList.add('hidden');
  $('test-setup').classList.remove('hidden');
  updateHeroVisibility();
}

function toggleTestFlag() {
  testFlagged[testIdx] = !testFlagged[testIdx];
  const isFlagged = testFlagged[testIdx];
  const flagBtn = $('t-flag');
  flagBtn.textContent = isFlagged ? '☑ Flagged' : '☐ Flag for Review';
  flagBtn.classList.toggle('is-flagged', isFlagged);
  updateNavGrid();
}

function updateCountdownDisplay() {
  const countdown = $('t-countdown');
  if (!testTimeLimitSeconds) {
    countdown.textContent = '';
    return;
  }
  const remaining = testTimeLimitSeconds - testSeconds;
  if (remaining <= 0) {
    countdown.textContent = 'TIME';
    countdown.classList.add('is-warning');
    return;
  }
  const min = Math.floor(remaining / 60);
  const sec = remaining % 60;
  countdown.textContent = `${min}:${String(sec).padStart(2, '0')} left`;
  countdown.classList.toggle('is-warning', remaining <= 300);
}

function reviewAllTest() {
  const results = window._lastTestResults;
  if (!results || !results.length) {
    showToast('No test results to review.');
    return;
  }
  testReviewResults = results;
  testReviewQs = results.map((r) => SAFE_QUESTIONS.find((q) => q.id === r.qid)).filter(Boolean);
  testReviewIdx = 0;
  testReviewReturnTo = 'test';
  $('test-summary').classList.add('hidden');
  $('test-review').classList.remove('hidden');
  updateHeroVisibility();
  renderTestReviewQ();
}

function renderTestReviewQ() {
  const q = testReviewQs[testReviewIdx];
  const result = testReviewResults[testReviewIdx];
  if (!q || !result) return;

  const totalCorrect = testReviewResults.filter((r) => r.right).length;
  const totalWrong = testReviewResults.filter((r) => !r.right).length;
  $('tr-progress').textContent = `${testReviewIdx + 1}/${testReviewQs.length}`;
  $('tr-correct-count').textContent = totalCorrect;
  $('tr-wrong-count').textContent = totalWrong;
  $('tr-status').textContent = result.right ? '✓ You got this right' : '✗ Missed';
  $('tr-qid').textContent = `${q.id} · ${q.domain}`;
  $('tr-spec').textContent = `${q.subcategory}`;
  $('tr-stem').textContent = q.stem;

  $('tr-prev').disabled = testReviewIdx === 0;
  $('tr-next').textContent = testReviewIdx === testReviewQs.length - 1 ? 'Done' : 'Next →';

  const options = $('tr-options');
  options.innerHTML = '';
  q.options.forEach((opt, index) => {
    const letter = LETTERS[index];
    const button = document.createElement('button');
    button.className = 'option-btn locked';
    if (letter === q.correct) button.classList.add('correct');
    if (letter === result.given && !result.right) button.classList.add('wrong');
    const marker = letter === result.given ? ' ← your answer' : '';
    button.innerHTML = `<span class="letter">${letter.toUpperCase()}</span><span>${opt}${marker}</span>`;
    options.appendChild(button);
  });

  $('tr-rationale').innerHTML = `<div class="rationale-box"><div>${q.rationale}</div><div class="ref">${q.reference}</div></div>`;
}

function testReviewNav(dir) {
  testReviewIdx += dir;
  if (testReviewIdx < 0) testReviewIdx = 0;
  if (testReviewIdx >= testReviewQs.length) {
    exitTestReview();
    return;
  }
  renderTestReviewQ();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function exitTestReview() {
  $('test-review').classList.add('hidden');
  if (testReviewReturnTo === 'study') {
    $('view-test').classList.add('hidden');
    $('view-study').classList.remove('hidden');
    $('study-summary').classList.remove('hidden');
    $('nav-study').classList.add('active');
  } else {
    $('test-summary').classList.remove('hidden');
  }
  updateHeroVisibility();
}

function reviewAllStudy() {
  if (!studyAnswers.length) {
    showToast('No questions to review.');
    return;
  }
  testReviewResults = studyAnswers.map((a) => ({
    qid: a.qid,
    given: a.given,
    correct: a.correct,
    right: a.right,
    sub: a.sub,
    domain: a.domain
  }));
  testReviewQs = testReviewResults.map((r) => SAFE_QUESTIONS.find((q) => q.id === r.qid)).filter(Boolean);
  testReviewIdx = 0;
  testReviewReturnTo = 'study';
  $('study-summary').classList.add('hidden');
  $('view-study').classList.add('hidden');
  $('view-test').classList.remove('hidden');
  $('test-setup').classList.add('hidden');
  $('test-active').classList.add('hidden');
  $('test-summary').classList.add('hidden');
  $('test-review').classList.remove('hidden');
  document.querySelectorAll('.nav button').forEach((b) => b.classList.remove('active'));
  updateHeroVisibility();
  renderTestReviewQ();
}

function getDeckSubset(source, count, shouldShuffle = true) {
  let pool = [...getPoolBySource(source)];
  if (shouldShuffle) pool = shuffle(pool);
  if (count === 0) return pool;
  return pool.slice(0, Math.min(count, pool.length));
}

function getFlashcardTakeaway(question) {
  const optionText = getCorrectOptionText(question);
  const firstSentence = question.rationale.split(/(?<=[.!?])\s+/).find(Boolean) || question.rationale;
  return `Key takeaway: ${optionText}${firstSentence && !firstSentence.includes(optionText) ? ` — ${firstSentence}` : ''}`;
}

function setFlashcardPhase(nextPhase) {
  flashcardPhase = nextPhase;
  const phaseLabel = {
    prompt: 'Prompt',
    answer: 'Answer',
    explanation: 'Explanation'
  };
  $('flashcard-phase-label').textContent = phaseLabel[nextPhase] || 'Prompt';
  $('flashcard-answer-block').classList.toggle('hidden', nextPhase === 'prompt');
  $('flashcard-explanation-block').classList.toggle('hidden', nextPhase !== 'explanation');
  $('flashcard-rating-panel').classList.toggle('hidden', nextPhase !== 'explanation');

  const revealBtn = $('flashcard-reveal-btn');
  if (nextPhase === 'prompt') {
    revealBtn.textContent = 'Show Answer';
    revealBtn.disabled = false;
  } else if (nextPhase === 'answer') {
    revealBtn.textContent = 'Show Explanation';
    revealBtn.disabled = false;
  } else {
    revealBtn.textContent = 'Explanation Shown';
    revealBtn.disabled = true;
  }
}

function buildFlashcardGoogleSearchUrl(question, phase) {
  const parts = [question.stem, question.domain, question.subcategory];
  if (phase !== 'prompt') {
    parts.push(`Correct answer ${question.correct.toUpperCase()} ${getCorrectOptionText(question)}`);
  }
  if (phase === 'explanation') {
    parts.push(question.rationale);
  }
  parts.push('MRI registry prep');
  return `https://www.google.com/search?q=${encodeURIComponent(parts.join(' '))}`;
}

function buildFlashcardChatGPTUrl(question, phase) {
  const prompt = [
    'I am studying for the MRI registry exam. Please help me understand this concept clearly without oversimplifying it.',
    `Study phase: ${phase}`,
    `Domain: ${question.domain}`,
    `Subcategory: ${question.subcategory}`,
    `Question: ${question.stem}`
  ];
  if (phase !== 'prompt') {
    prompt.push(`Correct answer: ${question.correct.toUpperCase()}. ${getCorrectOptionText(question)}`);
  }
  if (phase === 'explanation') {
    prompt.push(`Rationale: ${question.rationale}`);
  }
  prompt.push('Please explain the concept in an exam-focused way and give one short memory tip.');
  if (phase === 'prompt') {
    prompt.push('Do not assume I have seen the answer yet. Focus on the concept being tested and how to think it through.');
  } else if (phase === 'answer') {
    prompt.push('Help me understand why this answer is right before going deep into broader explanation.');
  } else {
    prompt.push('Explain why the correct answer is right, why the other options are less correct, and reinforce the key teaching point.');
  }
  return `https://chatgpt.com/?q=${encodeURIComponent(prompt.join('\n'))}`;
}

function updateFlashcardAvailable() {
  const basePool = getPoolBySource($('flashcard-source').value);
  renderSimpleSelect('flashcard-domain-filter', buildDomainOptions(basePool), activeFlashDomain);
  const validFlashDomain = buildDomainOptions(basePool).some((option) => option.value === activeFlashDomain) ? activeFlashDomain : 'All';
  activeFlashDomain = validFlashDomain;
  renderSimpleSelect('flashcard-sub-filter', buildSubOptions(basePool, activeFlashDomain), activeFlashSub);
  const subValues = buildSubOptions(basePool, activeFlashDomain).map((option) => option.value);
  if (!subValues.includes(activeFlashSub)) {
    activeFlashSub = 'All';
    renderSimpleSelect('flashcard-sub-filter', buildSubOptions(basePool, activeFlashDomain), activeFlashSub);
  }
  const pool = getFlashcardSourcePool();
  $('flashcard-available-count').textContent = `${pool.length} cards available`;
}

function renderFlashcardRatingState(qid) {
  const rating = getQuestionMetaEntry(qid).flashcardRating;
  document.querySelectorAll('.flashcard-rating-btn').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.rating === rating);
  });
}

function renderFlashcardCard() {
  const question = flashcardDeck[flashcardIdx];
  if (!question) return;
  $('flashcard-progress').textContent = `${flashcardIdx + 1}/${flashcardDeck.length}`;
  $('flashcard-domain').textContent = question.domain;
  $('flashcard-subcategory').textContent = question.subcategory;
  $('flashcard-front').textContent = question.stem;
  $('flashcard-answer').innerHTML = getCorrectOptionText(question);
  $('flashcard-rationale').textContent = question.rationale;
  $('flashcard-takeaway').textContent = getFlashcardTakeaway(question);
  $('flashcard-reference').innerHTML = `<strong>Reference:</strong> ${question.reference}`;
  $('flashcard-search-btn').onclick = () => {
    window.open(buildFlashcardGoogleSearchUrl(question, flashcardPhase), '_blank', 'noopener');
  };
  $('flashcard-chatgpt-btn').onclick = () => {
    window.open(buildFlashcardChatGPTUrl(question, flashcardPhase), '_blank', 'noopener');
  };
  setFlashcardPhase(flashcardPhase);
  renderFlashcardRatingState(question.id);
}

function startFlashcards() {
  const source = $('flashcard-source').value;
  const count = parseInt($('flashcard-count').value, 10);
  const shouldShuffle = $('flashcard-shuffle').checked;
  let deck = [...getFlashcardSourcePool()];
  if (shouldShuffle) deck = shuffle(deck);
  if (count !== 0) deck = deck.slice(0, Math.min(count, deck.length));
  if (!deck.length) {
    showToast('No flashcards match this source right now.');
    return;
  }
  flashcardDeck = deck;
  flashcardIdx = 0;
  flashcardPhase = 'prompt';
  lastFlashcardSource = source;
  $('flashcard-summary').classList.add('hidden');
  $('flashcard-source-label').textContent = describeSource(source);
  $('flashcard-setup').classList.add('hidden');
  $('flashcard-active').classList.remove('hidden');
  updateHeroVisibility();
  renderFlashcardCard();
}

function restartFlashcards() {
  $('flashcard-source').value = lastFlashcardSource;
  startFlashcards();
}

function revealFlashcard() {
  if (!flashcardDeck.length) return;
  if (flashcardPhase === 'prompt') {
    setFlashcardPhase('answer');
    return;
  }
  if (flashcardPhase === 'answer') {
    setFlashcardPhase('explanation');
  }
}

function moveFlashcard(dir) {
  if (!flashcardDeck.length) return;
  flashcardIdx += dir;
  if (flashcardIdx < 0) flashcardIdx = 0;
  if (flashcardIdx >= flashcardDeck.length) flashcardIdx = flashcardDeck.length - 1;
  flashcardPhase = 'prompt';
  renderFlashcardCard();
}

function endFlashcards() {
  const rated = flashcardDeck.map((question) => getQuestionMetaEntry(question.id).flashcardRating).filter(Boolean);
  const know = rated.filter((item) => item === 'Know it').length;
  const shaky = rated.filter((item) => item === 'Shaky').length;
  const missed = rated.filter((item) => item === 'Missed').length;
  flashcardSessionStats = { total: flashcardDeck.length, know, shaky, missed };
  $('flashcard-summary-stats').innerHTML = `
    <div class="stat-card"><div class="val">${flashcardDeck.length}</div><div class="label">Cards</div></div>
    <div class="stat-card"><div class="val">${know}</div><div class="label">Know It</div></div>
    <div class="stat-card"><div class="val">${shaky}</div><div class="label">Shaky</div></div>
    <div class="stat-card"><div class="val">${missed}</div><div class="label">Missed</div></div>
  `;
  $('flashcard-summary-insight').textContent = `${missed ? `${missed} cards still need work.` : 'Strong flashcard pass.'} ${getSuggestedNextAction()}`;
  $('flashcard-active').classList.add('hidden');
  $('flashcard-summary').classList.remove('hidden');
  updateHeroVisibility();
}

function buildReviewItems(source, count) {
  const shouldShuffle = $('review-shuffle').checked;
  let pool = [...getReviewSourcePool()];
  if (shouldShuffle) pool = shuffle(pool);
  const questions = count === 0 ? pool : pool.slice(0, Math.min(count, pool.length));
  return questions.map((question) => ({
    id: question.id,
    question,
    kicker: `${question.domain} · ${question.subcategory}`,
    title: question.stem,
    summary: question.rationale,
    takeaway: `Key takeaway: ${getCorrectOptionText(question)}`,
    answer: getCorrectOptionText(question),
    reference: question.reference
  }));
}

function updateReviewAvailable() {
  const basePool = getPoolBySource($('review-source').value);
  renderSimpleSelect('review-domain-filter', buildDomainOptions(basePool), activeReviewDomain);
  const validReviewDomain = buildDomainOptions(basePool).some((option) => option.value === activeReviewDomain) ? activeReviewDomain : 'All';
  activeReviewDomain = validReviewDomain;
  renderSimpleSelect('review-sub-filter', buildSubOptions(basePool, activeReviewDomain), activeReviewSub);
  const subValues = buildSubOptions(basePool, activeReviewDomain).map((option) => option.value);
  if (!subValues.includes(activeReviewSub)) {
    activeReviewSub = 'All';
    renderSimpleSelect('review-sub-filter', buildSubOptions(basePool, activeReviewDomain), activeReviewSub);
  }
  const count = parseInt($('review-count').value, 10);
  const pool = getReviewSourcePool();
  $('review-available-count').textContent = `${count === 0 ? pool.length : Math.min(count, pool.length)} review cards ready`;
}

function renderReviewCard() {
  const item = reviewDeck[reviewIdx];
  if (!item) return;
  $('review-progress').textContent = `${reviewIdx + 1}/${reviewDeck.length}`;
  $('review-kicker').textContent = item.kicker;
  $('review-title').textContent = item.title;
  $('review-card-summary').textContent = item.summary;
  $('review-takeaway').textContent = item.takeaway;
  $('review-answer').innerHTML = `<strong>Correct answer:</strong> ${item.answer}`;
  $('review-reference').innerHTML = `<strong>Reference:</strong> ${item.reference}`;
  $('review-search-btn').onclick = () => {
    window.open(buildGoogleSearchUrl(item.question), '_blank', 'noopener');
  };
  $('review-chatgpt-btn').onclick = () => {
    window.open(buildChatGPTUrl(item.question), '_blank', 'noopener');
  };
}

function startReview() {
  const source = $('review-source').value;
  const count = parseInt($('review-count').value, 10);
  reviewDeck = buildReviewItems(source, count);
  if (!reviewDeck.length) {
    showToast('No review cards match this source right now.');
    return;
  }
  reviewIdx = 0;
  $('review-summary').classList.add('hidden');
  $('review-source-label').textContent = describeSource(source);
  $('review-setup').classList.add('hidden');
  $('review-active').classList.remove('hidden');
  updateHeroVisibility();
  renderReviewCard();
}

function moveReview(dir) {
  if (!reviewDeck.length) return;
  reviewIdx += dir;
  if (reviewIdx < 0) reviewIdx = 0;
  if (reviewIdx >= reviewDeck.length) reviewIdx = reviewDeck.length - 1;
  renderReviewCard();
}

function markReviewHighYield() {
  const item = reviewDeck[reviewIdx];
  if (!item) return;
  if (!getQuestionFlags(item.id).includes('High Yield')) {
    toggleQuestionFlag(item.id, 'High Yield');
    showToast('Saved as High Yield');
  } else {
    showToast('Already marked High Yield');
  }
}

function endReview() {
  reviewSessionStats = { total: reviewDeck.length, source: $('review-source').value };
  $('review-summary-stats').innerHTML = `
    <div class="stat-card"><div class="val">${reviewDeck.length}</div><div class="label">Cards</div></div>
    <div class="stat-card"><div class="val">${describeSource($('review-source').value)}</div><div class="label">Source</div></div>
  `;
  $('review-summary-insight').textContent = `You reviewed ${reviewDeck.length} concept cards. ${getSuggestedNextAction()}`;
  $('review-active').classList.add('hidden');
  $('review-summary').classList.remove('hidden');
  updateHeroVisibility();
}

function loadDashboard() {
  const progress = getProgress();
  const sessions = getSessions();
  const weakInsights = getWeakAreaInsights();

  const totalQs = Object.keys(progress).length;
  let totalAttempts = 0;
  let totalCorrect = 0;
  Object.values(progress).forEach((item) => {
    totalAttempts += item.attempts;
    totalCorrect += item.correct;
  });
  const overallPct = totalAttempts ? Math.round((totalCorrect / totalAttempts) * 100) : 0;

  $('dash-stats').innerHTML = `
    <div class="stat-card"><div class="val">${SAFE_QUESTIONS.length}</div><div class="label">Total Questions</div></div>
    <div class="stat-card"><div class="val">${totalQs}</div><div class="label">Attempted</div></div>
    <div class="stat-card"><div class="val">${totalAttempts}</div><div class="label">Total Answers</div></div>
    <div class="stat-card"><div class="val" style="color:var(--gold)">${overallPct}%</div><div class="label">Overall Accuracy</div></div>
  `;

  $('dash-weak-stats').innerHTML = `
    <div class="stat-card"><div class="val">${weakInsights.weakestDomain ? weakInsights.weakestDomain.name : '—'}</div><div class="label">Weakest Domain</div></div>
    <div class="stat-card"><div class="val">${weakInsights.strongestDomain ? weakInsights.strongestDomain.name : '—'}</div><div class="label">Strongest Domain</div></div>
  `;
  $('dash-weak-list').innerHTML = weakInsights.topSubcategories.length
    ? weakInsights.topSubcategories
        .map((item) => `
          <div class="weak-item">
            <div class="weak-copy">
              <div class="weak-title">${item.domain} → ${item.name}</div>
              <div class="weak-meta">Weakness score ${item.score}. Best next step: targeted review or flashcards.</div>
            </div>
            <div class="weak-score">${item.score}</div>
          </div>`)
        .join('')
    : '<div class="weak-item"><div class="weak-copy"><div class="weak-title">No clear weak areas yet</div><div class="weak-meta">Answer more questions or rate flashcards to unlock smarter recommendations.</div></div></div>';

  const presets = getPresets();
  $('preset-list').innerHTML = presets.length
    ? presets
        .map((preset) => `
          <div class="preset-item">
            <div class="preset-copy">
              <div class="preset-title">${preset.name}</div>
              <div class="preset-meta">${preset.mode[0].toUpperCase() + preset.mode.slice(1)} preset | ${summarizePreset(preset)}</div>
            </div>
            <div class="preset-actions">
              <button class="btn btn-secondary btn-small" type="button" onclick="applyPresetById('${preset.id}')">Load</button>
              <button class="btn btn-secondary btn-small" type="button" onclick="deletePreset('${preset.id}')">Delete</button>
            </div>
          </div>`)
        .join('')
    : '<div class="preset-item"><div class="preset-copy"><div class="preset-title">No presets saved yet</div><div class="preset-meta">Save a setup from Study, Flashcards, or Review to reuse it here.</div></div></div>';

  const flagCounts = FLAG_TYPES.map((flag) => ({
    flag,
    count: SAFE_QUESTIONS.reduce((sum, question) => sum + (getQuestionFlags(question.id).includes(flag) ? 1 : 0), 0)
  })).filter((entry) => entry.count > 0);
  $('dash-flags').innerHTML = flagCounts.length
    ? flagCounts
        .sort((a, b) => b.count - a.count)
        .slice(0, 6)
        .map((entry) => `<div class="stat-card"><div class="val">${entry.count}</div><div class="label">${entry.flag}</div></div>`)
        .join('')
    : '<div class="stat-card"><div class="val">0</div><div class="label">No Flags Yet</div></div>';

  const bySub = {};
  SAFE_QUESTIONS.forEach((q) => {
    if (!bySub[q.subcategory]) bySub[q.subcategory] = { total: 0, attempted: 0, correct: 0, attempts: 0 };
    bySub[q.subcategory].total += 1;
    const item = progress[q.id];
    if (item) {
      bySub[q.subcategory].attempted += 1;
      bySub[q.subcategory].correct += item.correct;
      bySub[q.subcategory].attempts += item.attempts;
    }
  });

  const domains = $('dash-domains');
  domains.innerHTML = '';
  Object.entries(bySub)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([subcategory, data]) => {
      const pct = data.attempts ? Math.round((data.correct / data.attempts) * 100) : 0;
      const color = pct >= 80 ? 'var(--correct)' : pct >= 60 ? 'var(--gold)' : 'var(--wrong)';
      domains.innerHTML += `
        <div class="domain-bar">
          <div class="name">${subcategory}<small>${data.attempted}/${data.total} seen</small></div>
          <div class="bar-bg"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>
          <div class="pct" style="color:${color}">${data.attempts ? `${pct}%` : '—'}</div>
        </div>`;
    });

  const history = $('dash-history');
  if (!sessions.length) {
    history.innerHTML = '<p class="inline-note">No sessions yet. Start with a study set or a practice test.</p>';
    return;
  }

  let html = '<div class="history-list">';
  sessions.slice(0, 10).forEach((session) => {
    const date = new Date(session.date);
    const dateStr = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const badge = session.type === 'test' ? 'T' : 'S';
    const color = session.pct >= 75 ? 'var(--correct)' : session.pct >= 60 ? 'var(--gold)' : 'var(--wrong)';
    const title = `${session.type === 'test' ? 'Test' : 'Study'} · ${session.total} Qs${session.domain && session.domain !== 'All' ? ` · ${session.domain}` : ''}`;
    html += `
      <div class="history-item">
        <div class="history-icon">${badge}</div>
        <div class="history-copy">
          <div class="history-title">${title}</div>
          <div class="history-time">${dateStr}</div>
        </div>
        <div class="history-score" style="color:${color}">${session.pct}%</div>
      </div>`;
  });
  html += '</div>';
  history.innerHTML = html;
}

function loadDashboardIfVisible() {
  if (!$('view-dashboard').classList.contains('hidden')) loadDashboard();
}

function resetProgress() {
  if (!confirm('Clear all progress data?')) return;
  localStorage.removeItem(STORAGE_KEYS.progress);
  localStorage.removeItem(STORAGE_KEYS.sessions);
  localStorage.removeItem(STORAGE_KEYS.questionMeta);
  loadDashboard();
  updateHeroMetrics();
  refreshFilterControls();
  setDataFeedback('Study progress was cleared from this browser.', 'success');
  showToast('Progress cleared');
}

function resetLocalData() {
  if (!confirm('Reset all local data for this app on this browser? This clears progress, presets, flags, ratings, and theme preferences.')) return;
  Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
  activeDomain = 'All';
  activeSub = 'All';
  activeStatusFilter = 'all';
  activeFlagFilter = 'all';
  activeFlashDomain = 'All';
  activeFlashSub = 'All';
  activeReviewDomain = 'All';
  activeReviewSub = 'All';
  initFilters();
  updateHeroMetrics();
  loadDashboard();
  updateFlashcardAvailable();
  updateReviewAvailable();
  applyThemeSettings('dark', 'teal');
  setDataFeedback('All local app data has been reset on this browser.', 'success');
  showToast('Local data reset');
}

function bindStudySupportControls() {
  $('hero-overview-toggle').addEventListener('click', () => {
    const viewKey = getHeroOverviewViewKey();
    if (!viewKey) return;
    setOverviewCollapsed(viewKey, !getOverviewCollapsed(viewKey));
    syncHeroOverviewState();
  });
  $('study-status-filter').addEventListener('change', (event) => {
    activeStatusFilter = event.target.value;
    updateAvailable();
    updateFlashcardAvailable();
    updateReviewAvailable();
  });
  $('study-flag-filter').addEventListener('change', (event) => {
    activeFlagFilter = event.target.value;
    updateAvailable();
    updateFlashcardAvailable();
    updateReviewAvailable();
  });
  $('review-flagged-btn').addEventListener('click', startFlaggedReview);
  $('toggle-flags-btn').addEventListener('click', () => {
    const isHidden = $('flag-panel').classList.toggle('hidden');
    $('toggle-flags-btn').classList.toggle('is-open', !isHidden);
  });
  document.querySelectorAll('.confidence-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const q = studyQs[studyIdx];
      if (!q) return;
      setQuestionConfidence(q.id, button.dataset.confidence);
      showToast(`Saved confidence: ${button.dataset.confidence}`);
    });
  });
  $('save-study-preset-btn').addEventListener('click', () => savePreset('study'));
}

function bindLearningModeControls() {
  $('flashcard-source').addEventListener('change', updateFlashcardAvailable);
  $('flashcard-count').addEventListener('change', updateFlashcardAvailable);
  $('flashcard-shuffle').addEventListener('change', updateFlashcardAvailable);
  $('flashcard-domain-filter').addEventListener('change', (event) => {
    activeFlashDomain = event.target.value;
    activeFlashSub = 'All';
    updateFlashcardAvailable();
  });
  $('flashcard-sub-filter').addEventListener('change', (event) => {
    activeFlashSub = event.target.value;
    updateFlashcardAvailable();
  });
  $('start-flashcards-btn').addEventListener('click', startFlashcards);
  $('restart-flashcards-btn').addEventListener('click', restartFlashcards);
  $('save-flashcards-preset-btn').addEventListener('click', () => savePreset('flashcards'));
  $('flashcard-reveal-btn').addEventListener('click', revealFlashcard);
  $('flashcard-prev-btn').addEventListener('click', () => moveFlashcard(-1));
  $('flashcard-next-btn').addEventListener('click', () => moveFlashcard(1));
  $('flashcard-end-btn').addEventListener('click', endFlashcards);
  document.querySelectorAll('.flashcard-rating-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const current = flashcardDeck[flashcardIdx];
      if (!current) return;
      if (button.dataset.rating === 'Missed' && flashcardPhase !== 'explanation') {
        setFlashcardPhase('explanation');
      }
      setFlashcardRating(current.id, button.dataset.rating);
      showToast(`Saved flashcard rating: ${button.dataset.rating}`);
    });
  });

  $('review-source').addEventListener('change', updateReviewAvailable);
  $('review-count').addEventListener('change', updateReviewAvailable);
  $('review-domain-filter').addEventListener('change', (event) => {
    activeReviewDomain = event.target.value;
    activeReviewSub = 'All';
    updateReviewAvailable();
  });
  $('review-sub-filter').addEventListener('change', (event) => {
    activeReviewSub = event.target.value;
    updateReviewAvailable();
  });
  $('start-review-btn').addEventListener('click', startReview);
  $('save-review-preset-btn').addEventListener('click', () => savePreset('review'));
  $('review-prev-btn').addEventListener('click', () => moveReview(-1));
  $('review-next-btn').addEventListener('click', () => moveReview(1));
  $('review-flag-highyield-btn').addEventListener('click', markReviewHighYield);
  $('review-end-btn').addEventListener('click', endReview);
  $('flashcard-summary-restart-btn').addEventListener('click', restartFlashcards);
  $('flashcard-summary-new-btn').addEventListener('click', () => {
    $('flashcard-summary').classList.add('hidden');
    $('flashcard-setup').classList.remove('hidden');
    updateHeroVisibility();
  });
  $('review-summary-restart-btn').addEventListener('click', startReview);
  $('review-summary-new-btn').addEventListener('click', () => {
    $('review-summary').classList.add('hidden');
    $('review-setup').classList.remove('hidden');
    updateHeroVisibility();
  });

  document.addEventListener('keydown', (event) => {
    if (!$('view-flashcards').classList.contains('hidden') && !$('flashcard-active').classList.contains('hidden')) {
      if (event.code === 'Space') {
        event.preventDefault();
        revealFlashcard();
      } else if (event.key === 'ArrowRight') {
        moveFlashcard(1);
      } else if (event.key === 'ArrowLeft') {
        moveFlashcard(-1);
      }
    }
  });
}

function bindSettingsControls() {
  $('settings-trigger').addEventListener('click', openSettings);
  $('settings-close').addEventListener('click', closeSettings);
  $('settings-overlay').addEventListener('click', closeSettings);
  $('preset-modal-close').addEventListener('click', closePresetModal);
  $('preset-save-cancel-btn').addEventListener('click', closePresetModal);
  $('preset-overlay').addEventListener('click', closePresetModal);
  $('preset-save-confirm-btn').addEventListener('click', confirmSavePreset);
  $('preset-name-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      confirmSavePreset();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeSettings();
      closePresetModal();
    }
  });

  document.querySelectorAll('[data-theme-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      applyThemeSettings(button.dataset.themeMode, getThemeSettings().accent);
    });
  });

  document.querySelectorAll('#accent-controls [data-accent]').forEach((button) => {
    button.addEventListener('click', () => {
      applyThemeSettings(getThemeSettings().mode, button.dataset.accent);
    });
  });

  $('export-data-btn').addEventListener('click', exportAllData);
  $('import-data-btn').addEventListener('click', () => $('import-data-file').click());
  $('import-data-file').addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (file) importAllData(file);
    event.target.value = '';
  });
  $('reset-local-data-btn').addEventListener('click', resetLocalData);

  $('dash-weak-study-btn').addEventListener('click', () => {
    showView('study');
    activeDomain = 'All';
    activeSub = 'All';
    activeStatusFilter = 'missed';
    activeFlagFilter = 'all';
    initFilters();
    startStudyWithPool(getWeakAreaPool().length ? getWeakAreaPool() : getWeakQuestions());
  });
  $('dash-weak-flashcards-btn').addEventListener('click', () => {
    showView('flashcards');
    $('flashcard-source').value = 'weak';
    updateFlashcardAvailable();
    startFlashcards();
  });
  $('dash-weak-review-btn').addEventListener('click', () => {
    showView('review');
    $('review-source').value = 'weak';
    updateReviewAvailable();
    startReview();
  });

  syncSettingsUI();
  setDataFeedback('Tip: export before making big resets or switching devices.');
}

document.addEventListener('DOMContentLoaded', () => {
  if (!SAFE_QUESTIONS.length) {
    document.querySelector('.container').innerHTML = `
      <div class="card" style="text-align:center;padding:40px;">
        <h2 style="color:var(--wrong);">Questions Not Loaded</h2>
        <p style="color:var(--text-dim);margin-top:12px;">Make sure <code>questions.js</code> is in the same folder as this HTML file.</p>
      </div>`;
    return;
  }

  bindSettingsControls();
  bindStudySupportControls();
  bindLearningModeControls();
  updateHeroMetrics();
  initFilters();
  loadDashboard();
  updateTestInfo();
  updateFlashcardAvailable();
  updateReviewAvailable();

  const { mode, accent } = getThemeSettings();
  applyThemeSettings(mode, accent);
  updateHeroVisibility();
});
