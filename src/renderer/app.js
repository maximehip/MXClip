'use strict'

const api = window.electronAPI

// ════════════════════════════════════════════════════════════════
// I18n
// ════════════════════════════════════════════════════════════════

let currentLang = 'fr'

const TRANSLATIONS = {
  fr: {
    // accueil
    'home.subtitle':          'Never miss a viral moment',
    'home.videoCard.title':   'Analyser une vidéo',
    'home.videoCard.desc':    "Pose des questions sur n'importe quelle vidéo ou détecte les meilleurs moments",
    'home.streamCard.title':  'Live stream',
    'home.streamCard.desc':   'Surveille un stream Twitch et réponds à des questions en direct',
    'home.tip':               '💡 Tes analyses sont mises en cache — relancer la même vidéo est instantané',
    // navigation
    'nav.back':               'Retour',
    'nav.newAnalysis':        'Nouvelle analyse',
    'nav.stop':               'Arrêter',
    // config vidéo
    'videoConfig.step.file':        '1. Fichier',
    'videoConfig.step.mode':        '2. Mode',
    'videoConfig.step.lang':        '3. Langue',
    'videoConfig.step1.title':      'Quelle vidéo veux-tu analyser ?',
    'videoConfig.step2.title':      'Que veux-tu faire ?',
    'videoConfig.step3.title':      'Dans quelle langue est la vidéo ?',
    'videoConfig.qa.title':         'Poser des questions',
    'videoConfig.qa.desc':          "Discute avec l'IA sur le contenu de ta vidéo",
    'videoConfig.clips.title':      'Créer des clips',
    'videoConfig.clips.desc':       'Détecte et exporte automatiquement les meilleurs moments',
    'videoConfig.launch':           "Lancer l'analyse",
    'videoConfig.dropzone.main':    'Glisse ta vidéo ici',
    'videoConfig.dropzone.sub':     'MP4, MOV, MKV, AVI — ou',
    'videoConfig.dropzone.btn':     'Choisir un fichier',
    'videoConfig.dropzone.change':  'Changer',
    // config stream
    'streamConfig.title':           'Surveillance live',
    'streamConfig.subtitle':        'Connecte-toi à un stream Twitch pour poser des questions en temps réel',
    'streamConfig.step1.title':     'URL du stream Twitch',
    'streamConfig.step2.title':     'Langue du stream',
    'streamConfig.launch':          'Commencer la surveillance',
    'streamConfig.placeholder':     'nom_de_la_chaine',
    // paramètres
    'settings.title':               'Mon compte',
    'settings.section.account':     'Compte',
    'settings.section.interface':   'Interface',
    'settings.section.storage':     'Stockage',
    'settings.username.label':      "Nom d'utilisateur",
    'settings.username.placeholder':'Votre nom',
    'settings.lang.label':          "Langue de l'interface",
    'settings.lang.fr':             '🇫🇷 Français',
    'settings.lang.en':             '🇺🇸 English',
    'settings.saveDir.label':       'Répertoire de sauvegarde',
    'settings.saveDir.desc':        'Les analyses et clips seront sauvegardés dans ce répertoire.',
    'settings.saveDir.btn':         'Choisir…',
    'settings.save':                'Sauvegarder',
    'settings.saved':               'Paramètres sauvegardés !',
    // setup modèles
    'setup.title':          'Initialisation',
    'setup.subtitle':       'Vérification des modèles IA…',
    'setup.whisper.desc':   'Transcription audio',
    'setup.nomic.desc':     'Embeddings vectoriels',
    'setup.gemma.desc':     'Analyse sémantique',
    'setup.fastvlm.desc':   'Vision · Apple Silicon',
    'setup.status.ready':   'déjà présent',
    'setup.status.done':    'installé',
    'setup.status.error':   'erreur',
    'setup.status.wait':    'en attente…',
    'setup.done':           'Tous les modèles sont prêts.',
    // divers JS
    'proc.finish':          'Terminé !',
    'proc.clipDetect':      'Détection de clips…',
    'proc.analyzing':       'Analyse en cours…',
    'proc.init':            'Initialisation…',
    'clips.created':        (n) => `${n} clips créés avec succès !`,
    'clips.ready':          'Prêt ! Tu peux poser tes questions.',
    'clips.ready.stream':   'Stream connecté — tu peux poser tes questions !',
    'clips.none':           'Aucun clip trouvé.',
    'clips.noViral':        "Aucun moment viral détecté pour l'instant.",
    'qa.welcome':           "Prêt ! L'analyse est terminée. Pose-moi n'importe quelle question sur la vidéo.",
    'qa.stream.ready':      'Stream prêt ! Pose-moi tes questions.',
    'stream.clips.enough':  'Données suffisantes — tu peux lancer la détection.',
    'err.noVideo':          "Sélectionne d'abord une vidéo",
    'err.noChannel':        'Entre le nom de la chaîne Twitch',
  },
  en: {
    // home
    'home.subtitle':          'Never miss a viral moment',
    'home.videoCard.title':   'Analyze a video',
    'home.videoCard.desc':    'Ask questions about any video or detect the best moments',
    'home.streamCard.title':  'Live stream',
    'home.streamCard.desc':   'Monitor a Twitch stream and answer questions live',
    'home.tip':               '💡 Your analyses are cached — relaunching the same video is instant',
    // navigation
    'nav.back':               'Back',
    'nav.newAnalysis':        'New analysis',
    'nav.stop':               'Stop',
    // video config
    'videoConfig.step.file':        '1. File',
    'videoConfig.step.mode':        '2. Mode',
    'videoConfig.step.lang':        '3. Language',
    'videoConfig.step1.title':      'Which video do you want to analyze?',
    'videoConfig.step2.title':      'What do you want to do?',
    'videoConfig.step3.title':      'What language is the video in?',
    'videoConfig.qa.title':         'Ask questions',
    'videoConfig.qa.desc':          'Chat with AI about your video content',
    'videoConfig.clips.title':      'Create clips',
    'videoConfig.clips.desc':       'Automatically detect and export the best moments',
    'videoConfig.launch':           'Launch analysis',
    'videoConfig.dropzone.main':    'Drop your video here',
    'videoConfig.dropzone.sub':     'MP4, MOV, MKV, AVI — or',
    'videoConfig.dropzone.btn':     'Choose a file',
    'videoConfig.dropzone.change':  'Change',
    // stream config
    'streamConfig.title':           'Live monitoring',
    'streamConfig.subtitle':        'Connect to a Twitch stream to ask questions in real time',
    'streamConfig.step1.title':     'Twitch stream URL',
    'streamConfig.step2.title':     'Stream language',
    'streamConfig.launch':          'Start monitoring',
    'streamConfig.placeholder':     'channel_name',
    // settings
    'settings.title':               'My account',
    'settings.section.account':     'Account',
    'settings.section.interface':   'Interface',
    'settings.section.storage':     'Storage',
    'settings.username.label':      'Username',
    'settings.username.placeholder':'Your name',
    'settings.lang.label':          'Interface language',
    'settings.lang.fr':             '🇫🇷 French',
    'settings.lang.en':             '🇺🇸 English',
    'settings.saveDir.label':       'Save directory',
    'settings.saveDir.desc':        'Analyses and clips will be saved in this directory.',
    'settings.saveDir.btn':         'Choose…',
    'settings.save':                'Save',
    'settings.saved':               'Settings saved!',
    // model setup
    'setup.title':          'Initialization',
    'setup.subtitle':       'Checking AI models…',
    'setup.whisper.desc':   'Audio transcription',
    'setup.nomic.desc':     'Vector embeddings',
    'setup.gemma.desc':     'Semantic analysis',
    'setup.fastvlm.desc':   'Vision · Apple Silicon',
    'setup.status.ready':   'already present',
    'setup.status.done':    'installed',
    'setup.status.error':   'error',
    'setup.status.wait':    'waiting…',
    'setup.done':           'All models are ready.',
    // misc JS
    'proc.finish':          'Done!',
    'proc.clipDetect':      'Clip detection…',
    'proc.analyzing':       'Analyzing…',
    'proc.init':            'Initializing…',
    'clips.created':        (n) => `${n} clip${n > 1 ? 's' : ''} created successfully!`,
    'clips.ready':          'Ready! Ask me anything about the video.',
    'clips.ready.stream':   'Stream connected — you can ask questions!',
    'clips.none':           'No clips found.',
    'clips.noViral':        'No viral moments detected yet.',
    'qa.welcome':           'Ready! Analysis complete. Ask me anything about the video.',
    'qa.stream.ready':      'Stream ready! Ask me your questions.',
    'stream.clips.enough':  'Enough data — you can start detection.',
    'err.noVideo':          'Please select a video first',
    'err.noChannel':        'Enter the Twitch channel name',
  },
}

function t(key) {
  const dict = TRANSLATIONS[currentLang] || TRANSLATIONS.fr
  return dict[key] !== undefined ? dict[key] : (TRANSLATIONS.fr[key] ?? key)
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n)
  })
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder)
  })
}

// ════════════════════════════════════════════════════════════════
// Settings
// ════════════════════════════════════════════════════════════════

let currentSettings = { username: '', uiLanguage: 'fr', saveDir: '' }

function updateTitlebarUsername() {
  const el = document.getElementById('titlebar-username')
  if (el) el.textContent = currentSettings.username || ''
}

function updateSettingsUI() {
  const usernameEl = document.getElementById('settings-username')
  const saveDirEl  = document.getElementById('settings-save-dir')
  if (usernameEl) usernameEl.value = currentSettings.username || ''
  if (saveDirEl)  saveDirEl.textContent = currentSettings.saveDir || '—'
  const grid = document.getElementById('settings-lang-grid')
  if (grid) {
    grid.querySelectorAll('.lang-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.value === currentSettings.uiLanguage)
    })
  }
}

document.getElementById('btn-settings').addEventListener('click', () => {
  updateSettingsUI()
  showScreen('screen-settings')
})

document.getElementById('back-settings').addEventListener('click', () => showScreen('screen-home'))

// Sélection langue dans les paramètres (mise à jour immédiate de l'UI)
document.getElementById('settings-lang-grid').querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('settings-lang-grid').querySelectorAll('.lang-btn').forEach(b => b.classList.remove('selected'))
    btn.classList.add('selected')
    currentLang = btn.dataset.value
    applyTranslations()
  })
})

document.getElementById('btn-pick-dir').addEventListener('click', async () => {
  const dir = await api.selectDir()
  if (dir) document.getElementById('settings-save-dir').textContent = dir
})

document.getElementById('btn-save-settings').addEventListener('click', async () => {
  const username  = document.getElementById('settings-username').value.trim()
  const uiLanguage = currentLang
  const rawDir     = document.getElementById('settings-save-dir').textContent
  const saveDir    = rawDir === '—' ? '' : rawDir

  currentSettings = { username, uiLanguage, saveDir }
  await api.saveSettings(currentSettings)
  updateTitlebarUsername()
  toast(t('settings.saved'), 'success')
})

// Chargement initial des settings
api.getSettings().then(s => {
  currentSettings = s
  currentLang = s.uiLanguage || 'fr'
  applyTranslations()
  updateTitlebarUsername()
  updateSettingsUI()
}).catch(() => {
  applyTranslations()
})

// ════════════════════════════════════════════════════════════════
// Navigation
// ════════════════════════════════════════════════════════════════

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'))
  document.getElementById(id).classList.add('active')
}

// ════════════════════════════════════════════════════════════════
// Toasts
// ════════════════════════════════════════════════════════════════

function toast(message, type = 'info') {
  const icons = { success: '✅', error: '❌', info: 'ℹ️' }
  const el = document.createElement('div')
  el.className = `toast ${type}`
  el.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`
  document.getElementById('toast-container').appendChild(el)
  setTimeout(() => el.remove(), 4200)
}

// ════════════════════════════════════════════════════════════════
// Logs
// ════════════════════════════════════════════════════════════════

const MAX_LOG_LINES = 300

function appendLog(containerId, message, level = 'info') {
  const el = document.getElementById(containerId)
  if (!el) return
  const shouldStickToBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 24
  const line = document.createElement('div')
  line.className = `log-line ${level}`
  line.textContent = message
  el.appendChild(line)
  while (el.childElementCount > MAX_LOG_LINES) {
    el.firstElementChild?.remove()
  }
  if (shouldStickToBottom) el.scrollTop = el.scrollHeight
}

function clearLog(id) {
  const el = document.getElementById(id)
  if (el) el.innerHTML = ''
}

// ════════════════════════════════════════════════════════════════
// Onglets
// ════════════════════════════════════════════════════════════════

function setupTabs(tabsId) {
  const tabsEl = document.getElementById(tabsId)
  if (!tabsEl) return
  tabsEl.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const panelId = `panel-${tab.dataset.tab}`
      tabsEl.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      // find all sibling tab-panels
      const container = tab.closest('.screen') || document
      container.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'))
      const panel = document.getElementById(panelId)
      if (panel) panel.classList.add('active')
    })
  })
}

setupTabs('tabs-qa')
setupTabs('tabs-stream')

// ════════════════════════════════════════════════════════════════
// Progress & étapes
// ════════════════════════════════════════════════════════════════

const STEPS_QA = [
  { key: 'extract',  icon: '🎬', label: 'Extraction',   desc: 'Séparation audio et frames' },
  { key: 'analyze',  icon: '👁️', label: 'Analyse',      desc: 'Compréhension du contenu visuel et audio' },
  { key: 'timeline', icon: '📋', label: 'Organisation', desc: 'Construction de la timeline' },
  { key: 'embed',    icon: '🧠', label: 'Mémorisation', desc: 'Indexation pour les questions' },
]
const STEPS_CLIPS = [
  { key: 'extract',  icon: '🎬', label: 'Extraction',   desc: 'Séparation audio et frames' },
  { key: 'analyze',  icon: '👁️', label: 'Analyse',      desc: 'Compréhension du contenu' },
  { key: 'search',   icon: '🔍', label: 'Détection',    desc: 'Recherche des moments viraux' },
  { key: 'cut',      icon: '✂️', label: 'Création',     desc: 'Découpe et formatage des clips' },
]

const TRIGGER_MAP_QA = {
  'Extracting audio':            'extract',
  'Extraction done':             'analyze',
  'Transcribing audio':          'analyze',
  'frame analysis done':         'timeline',
  'Building timeline':           'timeline',
  'Timeline saved':              'embed',
  'Loading cached timeline':     'timeline',
  'Embedding timeline':          'embed',
  'Embeddings saved':            'embed',
  'Loading cached embeddings':   'embed',
}
const TRIGGER_MAP_CLIPS = {
  'Extracting audio':            'extract',
  'Transcribing audio':          'analyze',
  'Building timeline':           'analyze',
  'Timeline saved':              'search',
  'Pass 1/2':                    'search',
  'windows scored':              'search',
  'Pass 2/2':                    'cut',
  'clip(s) created':             'cut',
  'Clip detection done':         'cut',
}

// Pourcentages cibles par étape
const STEP_PCT_QA    = { extract: 18, analyze: 55, timeline: 72, embed: 90 }
const STEP_PCT_CLIPS = { extract: 18, analyze: 45, search: 78, cut: 96 }

let currentSteps = []
let stepPctMap = {}
let activeStepKey = null
let currentPct = 3

function buildStepsList(steps) {
  currentSteps = steps
  const list = document.getElementById('steps-list')
  list.innerHTML = ''
  steps.forEach(s => {
    const el = document.createElement('div')
    el.className = 'step-item'
    el.id = `step-${s.key}`
    el.innerHTML = `
      <div class="step-icon">${s.icon}</div>
      <div class="step-text">
        <div class="step-name">${s.label}</div>
        <div class="step-desc">${s.desc}</div>
        <div class="step-desc-current" id="step-msg-${s.key}" style="display:none"></div>
      </div>
      <div class="step-status" id="step-status-${s.key}"></div>
    `
    list.appendChild(el)
  })
}

function setProgress(pct, subtitleText) {
  currentPct = pct
  const bar = document.getElementById('progress-bar')
  const pctEl = document.getElementById('progress-pct')
  if (bar)   bar.style.width = `${pct}%`
  if (pctEl) pctEl.textContent = `${Math.round(pct)}%`
  if (subtitleText) {
    const sub = document.getElementById('proc-subtitle')
    if (sub) sub.textContent = subtitleText
  }
}

function activateStep(key, lastMsg) {
  // Mark previous step as done
  if (activeStepKey && activeStepKey !== key) {
    const prevEl = document.getElementById(`step-${activeStepKey}`)
    if (prevEl) {
      prevEl.classList.remove('step-active')
      prevEl.classList.add('step-done')
      const icon = prevEl.querySelector('.step-icon')
      if (icon) icon.textContent = '✅'
      const statusEl = document.getElementById(`step-status-${activeStepKey}`)
      if (statusEl) statusEl.innerHTML = '<div class="step-check">✓</div>'
      const msgEl = document.getElementById(`step-msg-${activeStepKey}`)
      if (msgEl) msgEl.style.display = 'none'
    }
  }
  activeStepKey = key
  const el = document.getElementById(`step-${key}`)
  if (!el || el.classList.contains('step-done')) return

  el.classList.add('step-active')
  const statusEl = document.getElementById(`step-status-${key}`)
  if (statusEl) statusEl.innerHTML = '<div class="step-spinner"></div>'

  // set step message
  if (lastMsg) {
    const msgEl = document.getElementById(`step-msg-${key}`)
    if (msgEl) { msgEl.textContent = lastMsg; msgEl.style.display = 'block'; }
  }

  // advance progress
  const targetPct = stepPctMap[key]
  if (targetPct && targetPct > currentPct) {
    setProgress(targetPct, currentSteps.find(s => s.key === key)?.desc ?? '')
  }
}

function processLogForProgress(message, triggerMap) {
  for (const [trigger, stepKey] of Object.entries(triggerMap)) {
    if (message.includes(trigger)) {
      activateStep(stepKey, message.replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, ''))
      return
    }
  }
}

function finishAllSteps() {
  currentSteps.forEach(s => {
    const el = document.getElementById(`step-${s.key}`)
    if (el && !el.classList.contains('step-done')) {
      el.classList.remove('step-active')
      el.classList.add('step-done')
      const icon = el.querySelector('.step-icon')
      if (icon) icon.textContent = '✅'
      const statusEl = document.getElementById(`step-status-${s.key}`)
      if (statusEl) statusEl.innerHTML = '<div class="step-check">✓</div>'
    }
  })
  setProgress(100, t('proc.finish'))
}

// ════════════════════════════════════════════════════════════════
// Setup — téléchargement des modèles
// ════════════════════════════════════════════════════════════════

const MODEL_ROW_IDS = {
  'whisper':          'whisper',
  'nomic-embed-text': 'nomic',
  'gemma4:e4b':       'gemma',
  'fastvlm':          'fastvlm',
}

function setSetupBar(modelKey, pct, status, message) {
  const rowId = MODEL_ROW_IDS[modelKey]
  if (!rowId) return

  const barFill   = document.getElementById(`bar-${rowId}`)
  const pctEl     = document.getElementById(`pct-${rowId}`)
  const statusEl  = document.getElementById(`status-${rowId}`)
  const rowEl     = document.getElementById(`setup-row-${rowId}`)
  if (!barFill || !pctEl || !statusEl || !rowEl) return

  barFill.style.width = `${pct}%`
  pctEl.textContent   = status === 'checking' ? '—' : `${pct}%`

  rowEl.className = 'setup-row'

  if (status === 'ready' || status === 'done') {
    rowEl.classList.add('srow--done')
    statusEl.textContent = t(status === 'ready' ? 'setup.status.ready' : 'setup.status.done')
    statusEl.className = 'srow-status srow-status--done'
  } else if (status === 'error') {
    rowEl.classList.add('srow--error')
    statusEl.textContent = t('setup.status.error')
    statusEl.className = 'srow-status srow-status--error'
  } else if (status === 'downloading') {
    rowEl.classList.add('srow--active')
    statusEl.textContent = message ? message.slice(0, 30) : ''
    statusEl.className = 'srow-status srow-status--active'
  } else {
    statusEl.textContent = t('setup.status.wait')
    statusEl.className = 'srow-status'
  }
}

api.onSetupProgress(({ model, status, pct, message }) => {
  setSetupBar(model, pct, status, message ?? '')
})

api.onSetupDone(() => {
  // Marque toutes les barres à 100% puis transition vers l'accueil
  Object.keys(MODEL_ROW_IDS).forEach(key => setSetupBar(key, 100, 'done', ''))
  document.getElementById('setup-subtitle').textContent = t('setup.done')
  setTimeout(() => showScreen('screen-home'), 700)
})

// ════════════════════════════════════════════════════════════════
// Accueil
// ════════════════════════════════════════════════════════════════

document.getElementById('btn-goto-video').addEventListener('click', () => showScreen('screen-video-config'))
document.getElementById('btn-goto-stream').addEventListener('click', () => showScreen('screen-stream-config'))

// ════════════════════════════════════════════════════════════════
// Config vidéo
// ════════════════════════════════════════════════════════════════

document.getElementById('back-video-config').addEventListener('click', () => showScreen('screen-home'))

// ── Drop zone ──

const dropZone = document.getElementById('drop-zone')

function setVideoFile(filePath) {
  if (!filePath) return
  document.getElementById('video-path').value = filePath
  const name = filePath.split('/').pop() || filePath
  document.getElementById('dz-filename').textContent = name
  document.getElementById('dz-filesize').textContent = filePath
  document.getElementById('dz-idle').style.display = 'none'
  document.getElementById('dz-selected').style.display = 'flex'
}

dropZone.addEventListener('dragover', e => {
  e.preventDefault()
  dropZone.classList.add('drag-over')
})
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'))
dropZone.addEventListener('drop', e => {
  e.preventDefault()
  dropZone.classList.remove('drag-over')
  const file = e.dataTransfer.files[0]
  if (file) setVideoFile(file.path)
})
dropZone.addEventListener('click', async () => {
  const p = await api.selectFile()
  if (p) setVideoFile(p)
})

document.getElementById('btn-browse').addEventListener('click', async e => {
  e.stopPropagation()
  const p = await api.selectFile()
  if (p) setVideoFile(p)
})

document.getElementById('btn-change-file').addEventListener('click', async e => {
  e.stopPropagation()
  const p = await api.selectFile()
  if (p) setVideoFile(p)
})

// ── Mode cards ──

document.querySelectorAll('.mode-card-opt').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.mode-card-opt').forEach(c => c.classList.remove('selected'))
    card.classList.add('selected')
    card.querySelector('input[type="radio"]').checked = true
  })
})

// ── Langue vidéo ──

setupLangGrid('lang-grid-video', 'video-language')

// ── Lancement ──

document.getElementById('btn-start-video').addEventListener('click', async () => {
  const videoPath = document.getElementById('video-path').value.trim()
  if (!videoPath) { toast(t('err.noVideo'), 'error'); return }

  const modeInput = document.querySelector('input[name="video-mode"]:checked')
  const mode = modeInput ? modeInput.value : 'Q&A'
  const language = document.getElementById('video-language').value

  // Prépare l'écran de traitement
  clearLog('log-terminal')
  document.getElementById('proc-title').textContent = mode === 'Clip Detection'
    ? t('proc.clipDetect') : t('proc.analyzing')

  const steps = mode === 'Clip Detection' ? STEPS_CLIPS : STEPS_QA
  stepPctMap = mode === 'Clip Detection' ? STEP_PCT_CLIPS : STEP_PCT_QA
  activeStepKey = null
  currentPct = 3
  buildStepsList(steps)
  setProgress(3, t('proc.init'))
  showScreen('screen-processing')

  api.removeAllListeners('log')
  const triggerMap = mode === 'Clip Detection' ? TRIGGER_MAP_CLIPS : TRIGGER_MAP_QA
  api.onLog(({ message, level }) => {
    appendLog('log-terminal', message, level)
    processLogForProgress(message, triggerMap)
  })

  try {
    const clips = await api.startVideoAnalysis({ videoPath, mode, language })
    finishAllSteps()

    if (mode === 'Clip Detection') {
      await pause(600)
      renderClips(clips)
      showScreen('screen-clips')
      toast(t('clips.created')(clips.filter(c => c.reelPath).length), 'success')
    } else {
      await pause(600)
      populateStats()
      resetQAChat()
      showScreen('screen-video-qa')
      toast(t('clips.ready'), 'success')
    }
  } catch (err) {
    appendLog('log-terminal', `Erreur : ${err.message}`, 'error')
    toast(`Erreur : ${err.message}`, 'error')
    setProgress(currentPct, 'Une erreur est survenue')
  }
})

function pause(ms) { return new Promise(r => setTimeout(r, ms)) }

// ════════════════════════════════════════════════════════════════
// Q&A Vidéo
// ════════════════════════════════════════════════════════════════

document.getElementById('back-video-qa').addEventListener('click', () => showScreen('screen-home'))

document.getElementById('btn-send').addEventListener('click', sendVideoQuestion)
document.getElementById('chat-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendVideoQuestion() }
})

// Suggestions
document.querySelectorAll('#screen-video-qa .suggestion-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const q = chip.dataset.q
    document.getElementById('chat-input').value = q
    sendVideoQuestion()
  })
})

function resetQAChat() {
  const msgs = document.getElementById('chat-messages')
  msgs.innerHTML = `
    <div class="chat-welcome">
      <div class="chat-welcome-icon">🤖</div>
      <div class="chat-welcome-text">
        <strong>Prêt !</strong> L'analyse est terminée. Pose-moi n'importe quelle question sur la vidéo.
      </div>
    </div>
    <div class="suggestions" id="suggestions">
      <p class="suggestions-label">Suggestions :</p>
      <button class="suggestion-chip" data-q="De quoi parle cette vidéo ?">De quoi parle cette vidéo ?</button>
      <button class="suggestion-chip" data-q="Résume les points clés">Résume les points clés</button>
      <button class="suggestion-chip" data-q="Qui sont les personnes présentes ?">Qui est présent ?</button>
      <button class="suggestion-chip" data-q="Quels sont les moments les plus importants ?">Moments importants</button>
    </div>
  `
  msgs.querySelectorAll('.suggestion-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.getElementById('chat-input').value = chip.dataset.q
      sendVideoQuestion()
    })
  })
}

async function sendVideoQuestion() {
  const input = document.getElementById('chat-input')
  const question = input.value.trim()
  if (!question) return
  input.value = ''

  // Hide suggestions on first real question
  const sugg = document.getElementById('suggestions')
  if (sugg) { sugg.style.opacity = '0'; setTimeout(() => sugg.remove(), 300); }

  addChatMsg('chat-messages', question, 'user', '🧑')

  const typingEl = addTypingIndicator('chat-messages')
  document.getElementById('btn-send').disabled = true

  try {
    const answer = await api.askQuestion(question)
    typingEl.remove()
    addChatMsg('chat-messages', answer, 'assistant', '🤖')
  } catch (err) {
    typingEl.remove()
    addChatMsg('chat-messages', `Erreur : ${err.message}`, 'assistant', '⚠️')
  } finally {
    document.getElementById('btn-send').disabled = false
    input.focus()
  }
}

// ════════════════════════════════════════════════════════════════
// Stats onglet
// ════════════════════════════════════════════════════════════════

function populateStats() {
  const logLines = document.getElementById('log-terminal').querySelectorAll('.log-line')
  let audioWords = 0, frames = 0, clips = 0, events = 0

  logLines.forEach(l => {
    const t = l.textContent
    const wMatch = t.match(/(\d+)\s+(?:word|mot)/i)
    if (wMatch) audioWords = parseInt(wMatch[1])
    const fMatch = t.match(/(\d+)\s+frame/i)
    if (fMatch) frames = parseInt(fMatch[1])
    const cMatch = t.match(/(\d+)\s+clip/i)
    if (cMatch) clips = parseInt(cMatch[1])
    const eMatch = t.match(/(\d+)\s+event/i)
    if (eMatch) events = parseInt(eMatch[1])
  })

  const grid = document.getElementById('stats-grid')
  grid.innerHTML = ''
  const stats = [
    { icon: '🎙️', val: audioWords > 0 ? audioWords.toLocaleString() : '—', label: 'Mots transcrits' },
    { icon: '🖼️', val: frames > 0 ? frames.toLocaleString() : '—', label: 'Images analysées' },
    { icon: '📊', val: events > 0 ? events.toLocaleString() : '—', label: 'Événements détectés' },
    { icon: '✅', val: 'Terminé', label: 'Statut de l\'analyse' },
  ]
  stats.forEach(s => {
    const card = document.createElement('div')
    card.className = 'stat-card'
    card.innerHTML = `
      <div class="stat-icon">${s.icon}</div>
      <div class="stat-value">${s.val}</div>
      <div class="stat-label">${s.label}</div>
    `
    grid.appendChild(card)
  })
}

// ════════════════════════════════════════════════════════════════
// Config stream
// ════════════════════════════════════════════════════════════════

document.getElementById('back-stream-config').addEventListener('click', () => showScreen('screen-home'))
setupLangGrid('lang-grid-stream', 'stream-language')

document.getElementById('stream-url-short').addEventListener('input', e => {
  const val = e.target.value.trim()
  document.getElementById('stream-url').value = val ? `https://twitch.tv/${val}` : ''
})

document.getElementById('btn-start-stream').addEventListener('click', async () => {
  const shortName = document.getElementById('stream-url-short').value.trim()
  if (!shortName) { toast(t('err.noChannel'), 'error'); return }

  const url = `https://twitch.tv/${shortName}`
  const language = document.getElementById('stream-language').value

  // Réinitialiser le stream
  resetStreamUI()
  showScreen('screen-stream-qa')

  api.removeAllListeners('log')
  api.removeAllListeners('stream:ready')
  api.removeAllListeners('stream:event')

  // Logs techniques → panneau invisible (utilisé pour les clips)
  api.onLog(({ message, level }) => appendLog('stream-clips-log', message, level))

  // Événements en direct
  api.onStreamEvent(event => addStreamEvent(event))

  // Prêt pour les questions
  api.onStreamReady(() => {
    document.getElementById('stream-wait-qa').style.display = 'none'
    document.getElementById('stream-chat-bar').style.display = 'flex'
    const msgs = document.getElementById('stream-chat-messages')
    addChatMsg('stream-chat-messages', t('qa.stream.ready'), 'assistant', '🤖')
    msgs.scrollTop = msgs.scrollHeight
    toast(t('clips.ready.stream'), 'success')
    // Activer le bouton clips
    setClipButtonsEnabled(true)
  })

  try {
    await api.startStreamAnalysis({ url, mode: 'Q&A Mode', language })
  } catch (err) {
    toast(`Erreur de connexion : ${err.message}`, 'error')
  }
})

// ── Navigation entre panneaux stream ──

const MIN_EVENTS_QA = 10
let streamVisualCount = 0
let streamSummaryCount = 0

function resetStreamUI() {
  streamVisualCount = 0
  streamSummaryCount = 0
  document.getElementById('cnt-visual').textContent = '0'
  document.getElementById('cnt-summary').textContent = '0'
  document.getElementById('event-feed').innerHTML = `
    <div class="feed-empty" id="feed-empty">
      <div class="feed-empty-anim">
        <span></span><span></span><span></span><span></span><span></span>
      </div>
      <p>En attente des premiers événements…</p>
    </div>`
  document.getElementById('stream-chat-messages').innerHTML = `
    <div class="stream-wait-qa" id="stream-wait-qa">
      <div class="wait-icon">⏳</div>
      <p class="wait-label">Questions disponibles après <strong id="wait-threshold">${MIN_EVENTS_QA}</strong> événements</p>
      <div class="wait-progress-track">
        <div class="wait-progress-fill" id="wait-progress-fill" style="width:0%"></div>
      </div>
      <p class="wait-count" id="wait-count-label">0 / ${MIN_EVENTS_QA}</p>
    </div>`
  document.getElementById('stream-chat-bar').style.display = 'none'
  document.getElementById('stream-clips-log').innerHTML = ''
  document.getElementById('stream-clips-empty').style.display = 'flex'
  document.getElementById('stream-clips-creating').style.display = 'none'
  document.getElementById('stream-clips-grid').style.display = 'none'
  setClipButtonsEnabled(false)
  // afficher panneau En direct par défaut
  showStreamPanel('stream-feed')
}

function showStreamPanel(panelId) {
  document.querySelectorAll('.stream-panel').forEach(p => p.classList.remove('active'))
  document.querySelectorAll('.snav-tab').forEach(t => t.classList.remove('active'))
  document.getElementById(panelId).classList.add('active')
  const tab = document.querySelector(`.snav-tab[data-panel="${panelId}"]`)
  if (tab) tab.classList.add('active')
}

document.querySelectorAll('.snav-tab').forEach(tab => {
  tab.addEventListener('click', () => showStreamPanel(tab.dataset.panel))
})

function setClipButtonsEnabled(enabled) {
  const btn1 = document.getElementById('btn-create-clips')
  const btn2 = document.getElementById('btn-create-clips-2')
  if (btn1) btn1.disabled = !enabled
  if (btn2) btn2.disabled = !enabled
  if (enabled) {
    const note = document.getElementById('sce-note')
    if (note) note.textContent = t('stream.clips.enough')
  }
}

// ── Affichage d'un événement ──

function addStreamEvent(event) {
  // Supprimer l'état d'attente si présent
  const empty = document.getElementById('feed-empty')
  if (empty) empty.remove()

  // Mettre à jour les compteurs
  if (event.type === 'visual') {
    streamVisualCount++
    const el = document.getElementById('cnt-visual')
    if (el) { el.textContent = streamVisualCount; el.closest('.stream-counter').classList.add('has-data') }
  } else if (event.type === 'summary') {
    streamSummaryCount++
    const el = document.getElementById('cnt-summary')
    if (el) { el.textContent = streamSummaryCount; el.closest('.stream-counter').classList.add('has-data') }
  }

  // Barre de progression Q&A (basée sur les visions uniquement)
  const pct = Math.min(100, Math.round((streamVisualCount / MIN_EVENTS_QA) * 100))
  const fill = document.getElementById('wait-progress-fill')
  const label = document.getElementById('wait-count-label')
  if (fill) fill.style.width = `${pct}%`
  if (label) label.textContent = `${streamVisualCount} / ${MIN_EVENTS_QA}`

  // Créer la carte événement
  const card = document.createElement('div')
  card.className = `event-card ${event.type}`

  const typeLabel = event.type === 'visual' ? '👁️ Vision' : '🤖 Résumé IA'
  const facesHtml = (event.type === 'visual' && event.faceCount > 0)
    ? `<span class="event-faces">· ${event.faceCount} visage${event.faceCount > 1 ? 's' : ''}</span>` : ''

  card.innerHTML = `
    <div class="event-header">
      <span class="event-type-badge">${typeLabel}</span>
      ${facesHtml}
      <span class="event-ts">${formatTime(event.start)}</span>
    </div>
    <div class="event-text">${escHtml(event.text)}</div>
  `

  const feed = document.getElementById('event-feed')
  feed.appendChild(card)
  feed.scrollTop = feed.scrollHeight
}

// ════════════════════════════════════════════════════════════════
// Q&A Stream
// ════════════════════════════════════════════════════════════════

document.getElementById('back-stream-qa').addEventListener('click', () => {
  api.stopStream()
  showScreen('screen-home')
})

document.getElementById('btn-stream-send').addEventListener('click', sendStreamQuestion)
document.getElementById('stream-chat-input').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendStreamQuestion() }
})

async function sendStreamQuestion() {
  const input = document.getElementById('stream-chat-input')
  const question = input.value.trim()
  if (!question) return
  input.value = ''

  addChatMsg('stream-chat-messages', question, 'user', '🧑')
  const typingEl = addTypingIndicator('stream-chat-messages')
  document.getElementById('btn-stream-send').disabled = true

  try {
    const answer = await api.askQuestion(question)
    typingEl.remove()
    addChatMsg('stream-chat-messages', answer, 'assistant', '🤖')
  } catch (err) {
    typingEl.remove()
    addChatMsg('stream-chat-messages', `Erreur : ${err.message}`, 'assistant', '⚠️')
  } finally {
    document.getElementById('btn-stream-send').disabled = false
    input.focus()
  }
}

// ════════════════════════════════════════════════════════════════
// Clips Stream
// ════════════════════════════════════════════════════════════════

async function doCreateStreamClips() {
  showStreamPanel('stream-clips')
  document.getElementById('stream-clips-empty').style.display = 'none'
  document.getElementById('stream-clips-creating').style.display = 'flex'
  document.getElementById('stream-clips-grid').style.display = 'none'

  api.removeAllListeners('log')
  api.onLog(({ message, level }) => appendLog('stream-clips-log', message, level))

  try {
    const clips = await api.createStreamClips()
    document.getElementById('stream-clips-creating').style.display = 'none'

    if (!clips || clips.length === 0) {
      document.getElementById('stream-clips-empty').style.display = 'flex'
      document.getElementById('sce-note').textContent = t('clips.noViral')
      toast(t('clips.none'), 'info')
      return
    }

    const grid = document.getElementById('stream-clips-grid')
    grid.style.display = 'grid'
    renderClips(clips, 'stream-clips-grid', false)
    toast(t('clips.created')(clips.filter(c => c.reelPath).length), 'success')
  } catch (err) {
    document.getElementById('stream-clips-creating').style.display = 'none'
    document.getElementById('stream-clips-empty').style.display = 'flex'
    document.getElementById('sce-note').textContent = `Erreur : ${err.message}`
    toast(`Erreur : ${err.message}`, 'error')
  } finally {
    // Remettre le listener d'événements actif
    api.removeAllListeners('log')
    api.onLog(({ message, level }) => appendLog('stream-clips-log', message, level))
  }
}

document.getElementById('btn-create-clips').addEventListener('click', doCreateStreamClips)
document.getElementById('btn-create-clips-2').addEventListener('click', doCreateStreamClips)

// ════════════════════════════════════════════════════════════════
// Clips
// ════════════════════════════════════════════════════════════════

document.getElementById('back-clips').addEventListener('click', () => showScreen('screen-home'))

// ─────────────────────────────────────────────────────────────

const CAT_CONFIG = {
  clash:           { label: 'Clash',      icon: '🥊', color: '#f05b5b', bg: 'rgba(240,91,91,0.12)' },
  arrogance:       { label: 'Arrogance',  icon: '😤', color: '#f09a5b', bg: 'rgba(240,154,91,0.12)' },
  humor:           { label: 'Humour',     icon: '😂', color: '#f0d45b', bg: 'rgba(240,212,91,0.12)' },
  love:            { label: 'Amour',      icon: '💕', color: '#f05b9a', bg: 'rgba(240,91,154,0.12)' },
  friendship:      { label: 'Amitié',     icon: '🤝', color: '#5bc4f0', bg: 'rgba(91,196,240,0.12)' },
  shocking_reveal: { label: 'Révélation', icon: '😱', color: '#9a5bf0', bg: 'rgba(154,91,240,0.12)' },
  emotional_peak:  { label: 'Émotion',    icon: '😢', color: '#5b8af0', bg: 'rgba(91,138,240,0.12)' },
  achievement:     { label: 'Victoire',   icon: '🏆', color: '#3dd68c', bg: 'rgba(61,214,140,0.12)' },
  life_lesson:     { label: 'Leçon',      icon: '💡', color: '#7db07d', bg: 'rgba(125,176,125,0.12)' },
  controversial:   { label: 'Polémique',  icon: '🔥', color: '#f07a5b', bg: 'rgba(240,122,91,0.12)' },
  none:            { label: 'Clip',       icon: '🎬', color: '#7c6af7', bg: 'rgba(124,106,247,0.12)' },
}

let allClips = []
let activeFilter = 'all'

// renderClips(clips, gridId?, withFilters?)
function renderClips(clips, gridId = 'clips-grid', withFilters = true) {
  const isMain = gridId === 'clips-grid'
  allClips = clips.filter(c => c.reelPath)

  if (isMain) {
    const countLabel = document.getElementById('clips-count-label')
    countLabel.textContent = `${allClips.length} clip${allClips.length > 1 ? 's' : ''} détecté${allClips.length > 1 ? 's' : ''}`
  }

  if (allClips.length === 0) {
    if (isMain) { document.getElementById('no-clips').style.display = 'flex'; document.getElementById('clips-grid').style.display = 'none' }
    return
  }
  if (isMain) { document.getElementById('no-clips').style.display = 'none'; document.getElementById('clips-grid').style.display = 'grid' }

  // Filtres (seulement pour l'écran clips principal)
  if (withFilters) {
    const filtersEl = document.getElementById('clips-filters')
    filtersEl.innerHTML = '<button class="filter-btn active" data-cat="all">Tous</button>'
    const categories = [...new Set(allClips.map(c => c.category))]
    categories.forEach(cat => {
      const cfg = CAT_CONFIG[cat] || CAT_CONFIG.none
      const btn = document.createElement('button')
      btn.className = 'filter-btn'
      btn.dataset.cat = cat
      btn.textContent = `${cfg.icon} ${cfg.label}`
      filtersEl.appendChild(btn)
    })
    filtersEl.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        filtersEl.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        activeFilter = btn.dataset.cat
        fillClipGrid(gridId)
      })
    })
  }

  fillClipGrid(gridId)
}

function fillClipGrid(gridId = 'clips-grid') {
  const grid = document.getElementById(gridId)
  if (!grid) return
  grid.innerHTML = ''
  const filtered = (gridId === 'clips-grid' && activeFilter !== 'all')
    ? allClips.filter(c => c.category === activeFilter)
    : allClips

  filtered.forEach((clip, idx) => {
    const cfg = CAT_CONFIG[clip.category] || CAT_CONFIG.none
    const card = document.createElement('div')
    card.className = 'clip-card'
    card.style.animationDelay = `${idx * 60}ms`
    card.style.borderTopColor = cfg.color
    card.style.borderTopWidth = '2px'

    const scorePct = (clip.score / 10) * 100
    card.innerHTML = `
      <div class="clip-top">
        <div class="clip-cat-badge" style="background:${cfg.bg};color:${cfg.color};border:1px solid ${cfg.color}40">
          ${cfg.icon} ${cfg.label}
        </div>
        <span class="clip-num">#${clip.clipNum}</span>
      </div>
      <div class="clip-score-row">
        <div class="clip-score-bar-track">
          <div class="clip-score-bar-fill" style="width:0%" data-pct="${scorePct}"></div>
        </div>
        <span class="clip-score-val">★ ${clip.score}/10</span>
      </div>
      <div class="clip-time">
        <span>${formatTime(clip.startSeconds)}</span>
        <span class="clip-time-sep">→</span>
        <span>${formatTime(clip.endSeconds)}</span>
        <span class="clip-duration-badge">${clip.duration}s</span>
      </div>
      <div class="clip-hook">"${escHtml(clip.hook)}"</div>
      <div class="clip-reason">${escHtml(clip.reason)}</div>
      <button class="btn-open-clip" data-path="${escAttr(clip.reelPath)}">
        ▶ Ouvrir le clip
      </button>
    `
    grid.appendChild(card)

    setTimeout(() => {
      const fill = card.querySelector('.clip-score-bar-fill')
      if (fill) fill.style.width = `${fill.dataset.pct}%`
    }, 100 + idx * 60)
  })

  grid.querySelectorAll('.btn-open-clip').forEach(btn => {
    btn.addEventListener('click', () => api.openPath(btn.dataset.path))
  })
}

// ════════════════════════════════════════════════════════════════
// Helpers chat
// ════════════════════════════════════════════════════════════════

function addChatMsg(containerId, text, role, avatar) {
  const container = document.getElementById(containerId)
  const wrap = document.createElement('div')
  wrap.className = `chat-msg ${role}`
  wrap.innerHTML = `
    <div class="msg-avatar">${avatar}</div>
    <div class="msg-bubble">${escHtml(text)}</div>
  `
  container.appendChild(wrap)
  container.scrollTop = container.scrollHeight
  return wrap
}

function addTypingIndicator(containerId) {
  const container = document.getElementById(containerId)
  const wrap = document.createElement('div')
  wrap.className = 'chat-msg assistant'
  wrap.innerHTML = `
    <div class="msg-avatar">🤖</div>
    <div class="typing-indicator"><span></span><span></span><span></span></div>
  `
  container.appendChild(wrap)
  container.scrollTop = container.scrollHeight
  return wrap
}

// ════════════════════════════════════════════════════════════════
// Helpers communs
// ════════════════════════════════════════════════════════════════

function setupLangGrid(gridId, hiddenId) {
  const grid = document.getElementById(gridId)
  grid.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      grid.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('selected'))
      btn.classList.add('selected')
      document.getElementById(hiddenId).value = btn.dataset.value
    })
  })
}

function formatTime(s) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/\n/g, '<br>')
}
function escAttr(str) {
  return String(str || '').replace(/"/g, '&quot;')
}

// Toggle log
document.getElementById('log-toggle').addEventListener('click', () => {
  const col  = document.getElementById('log-collapse')
  const icon = document.getElementById('log-toggle-icon')
  const open = col.style.display !== 'none'
  col.style.display  = open ? 'none' : 'block'
  icon.classList.toggle('open', !open)
})
