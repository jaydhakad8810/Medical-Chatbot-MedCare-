/**
 * ═══════════════════════════════════════════════════════════
 *  MedCare AI – Main Application Script
 *  Features: Symptom Checker, Mental Wellness, Emergency
 *            Detection, Context Awareness, localStorage
 * ═══════════════════════════════════════════════════════════
 */

'use strict';

/* ─────────────────────────────────────────────
   1. CONSTANTS & CONFIGURATION
───────────────────────────────────────────── */

/** Emergency keywords that trigger the alert banner */
const EMERGENCY_KEYWORDS = [
  'chest pain', 'heart attack', 'cant breathe', "can't breathe",
  'cannot breathe', 'trouble breathing', 'difficulty breathing',
  'suicide', 'kill myself', 'want to die', 'end my life',
  'severe bleeding', 'heavy bleeding', 'bleeding heavily',
  'unconscious', 'not breathing', 'stroke', 'overdose',
  'poisoning', 'anaphylaxis', 'allergic reaction', 'seizure',
  'choking',
];

/** Risk levels for symptom assessment */
const RISK = { LOW: 'low', MEDIUM: 'medium', URGENT: 'urgent' };

/** localStorage keys */
const STORAGE = {
  PROFILE:  'medcareai_profile',
  HISTORY:  'medcareai_history',
  THEME:    'medcareai_theme',
};

/** Average simulated response delay in ms */
const RESPONSE_DELAY_MIN = 800;
const RESPONSE_DELAY_MAX = 1600;

/* ─────────────────────────────────────────────
   2. STATE
───────────────────────────────────────────── */

const state = {
  /** Current chat session messages */
  messages: [],
  /** Loaded user profile */
  profile: null,
  /** Whether wellness mood selector is open */
  moodOpen: false,
  /** Current conversation mode: null | 'symptoms' | 'wellness' | 'medication' */
  mode: null,
  /** Symptom follow-up step counter */
  symptomStep: 0,
  /** Collected symptoms text */
  collectedSymptoms: '',
};

/* ─────────────────────────────────────────────
   3. DOM REFERENCES
───────────────────────────────────────────── */

const DOM = {
  // Profile Modal
  profileModal:    document.getElementById('profile-modal'),
  profileForm:     document.getElementById('profile-form'),
  userName:        document.getElementById('user-name'),
  userAge:         document.getElementById('user-age'),
  userGender:      document.getElementById('user-gender'),
  userHistory:     document.getElementById('user-history'),

  // Header
  headerUsername:  document.getElementById('header-username'),
  clearChatBtn:    document.getElementById('clear-chat-btn'),
  themeToggleBtn:  document.getElementById('theme-toggle-btn'),

  // Main chat
  chatContainer:   document.getElementById('chat-container'),
  welcomeScreen:   document.getElementById('welcome-screen'),
  messagesList:    document.getElementById('messages-list'),

  // Quick action buttons
  qaSymptoms:      document.getElementById('qa-symptoms'),
  qaWellness:      document.getElementById('qa-wellness'),
  qaMedication:    document.getElementById('qa-medication'),
  qaEmergency:     document.getElementById('qa-emergency'),

  // Mood bar
  moodBar:         document.getElementById('mood-bar'),
  moodButtons:     document.querySelectorAll('.mood-btn'),
  wellnessToggle:  document.getElementById('wellness-toggle-btn'),

  // Input
  userInput:       document.getElementById('user-input'),
  sendBtn:         document.getElementById('send-btn'),

  // Emergency
  emergencyAlert:  document.getElementById('emergency-alert'),
  emergencyClose:  document.getElementById('emergency-close-btn'),
};

/* ─────────────────────────────────────────────
   4. LOCAL STORAGE UTILITIES
───────────────────────────────────────────── */

const Storage = {
  /** Save a value as JSON */
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (e) { console.warn('localStorage write failed:', e); }
  },
  /** Read and parse a JSON value */
  get(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },
  /** Remove a specific key */
  remove(key) {
    try { localStorage.removeItem(key); }
    catch (e) { /* ignore */ }
  },
};

/* ─────────────────────────────────────────────
   5. THEME MANAGEMENT
───────────────────────────────────────────── */

function initTheme() {
  const saved = Storage.get(STORAGE.THEME);
  const theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(theme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  Storage.set(STORAGE.THEME, theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

/* ─────────────────────────────────────────────
   6. PROFILE MANAGEMENT
───────────────────────────────────────────── */

function loadProfile() {
  const saved = Storage.get(STORAGE.PROFILE);
  if (saved && saved.name) {
    state.profile = saved;
    updateHeaderUser(saved.name);
    DOM.profileModal.classList.add('hidden');
    initChat();
  } else {
    DOM.profileModal.classList.remove('hidden');
  }
}

function saveProfile(data) {
  state.profile = data;
  Storage.set(STORAGE.PROFILE, data);
  updateHeaderUser(data.name);
}

function updateHeaderUser(name) {
  DOM.headerUsername.textContent = name.split(' ')[0]; // First name only
}

/* ─────────────────────────────────────────────
   7. CHAT HISTORY (localStorage)
───────────────────────────────────────────── */

function saveHistory() {
  // Keep last 100 messages to avoid storage bloat
  const trimmed = state.messages.slice(-100);
  Storage.set(STORAGE.HISTORY, trimmed);
}

function loadHistory() {
  const saved = Storage.get(STORAGE.HISTORY);
  if (saved && Array.isArray(saved) && saved.length > 0) {
    state.messages = saved;
    // Re-render all messages
    DOM.welcomeScreen.classList.add('hidden');
    saved.forEach(msg => renderMessage(msg, false));
    scrollToBottom();
  }
}

function clearHistory() {
  state.messages = [];
  state.mode = null;
  state.symptomStep = 0;
  state.collectedSymptoms = '';
  Storage.remove(STORAGE.HISTORY);
  DOM.messagesList.innerHTML = '';
  DOM.welcomeScreen.classList.remove('hidden');
  showToast('Chat cleared ✓');
}

/* ─────────────────────────────────────────────
   8. MESSAGE RENDERING
───────────────────────────────────────────── */

/**
 * Render a single message object into the DOM
 * @param {object} msg - { role, text, time, html?, badges? }
 * @param {boolean} animate - Whether to animate in
 */
function renderMessage(msg, animate = true) {
  const row = document.createElement('div');
  row.className = `message-row ${msg.role}`;
  if (!animate) row.style.animation = 'none';

  // Avatar
  const avatarEl = document.createElement('div');
  avatarEl.className = `msg-avatar ${msg.role}-avatar`;
  avatarEl.setAttribute('aria-hidden', 'true');

  if (msg.role === 'bot') {
    avatarEl.innerHTML = '🩺';
  } else {
    // Use initials
    const name = state.profile?.name || 'U';
    avatarEl.textContent = name.charAt(0).toUpperCase();
  }

  // Bubble
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';

  if (msg.html) {
    bubble.innerHTML = msg.html;
  } else {
    bubble.textContent = msg.text;
  }

  // Timestamp
  const timeEl = document.createElement('span');
  timeEl.className = 'msg-time';
  timeEl.textContent = msg.time || formatTime(new Date());

  const contentWrap = document.createElement('div');
  contentWrap.style.display = 'flex';
  contentWrap.style.flexDirection = 'column';
  contentWrap.appendChild(bubble);
  contentWrap.appendChild(timeEl);

  if (msg.role === 'bot') {
    row.appendChild(avatarEl);
    row.appendChild(contentWrap);
  } else {
    row.appendChild(contentWrap);
    row.appendChild(avatarEl);
  }

  DOM.messagesList.appendChild(row);

  if (animate) {
    // Scroll after a short paint delay
    requestAnimationFrame(scrollToBottom);
  }
}

/** Add a message to state + DOM + localStorage */
function addMessage(role, text, htmlContent = null) {
  DOM.welcomeScreen.classList.add('hidden');

  const msg = {
    role,
    text,
    html: htmlContent,
    time: formatTime(new Date()),
  };
  state.messages.push(msg);
  saveHistory();
  renderMessage(msg);
}

/** Format a Date object to HH:MM */
function formatTime(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/* ─────────────────────────────────────────────
   9. TYPING INDICATOR
───────────────────────────────────────────── */

let typingIndicatorEl = null;

function showTyping() {
  if (typingIndicatorEl) return;
  const wrap = document.createElement('div');
  wrap.className = 'typing-indicator';
  wrap.id = 'typing-indicator';

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar bot-avatar';
  avatar.setAttribute('aria-hidden', 'true');
  avatar.textContent = '🩺';

  const dots = document.createElement('div');
  dots.className = 'typing-dots';
  dots.innerHTML = '<span></span><span></span><span></span>';
  dots.setAttribute('aria-label', 'MedCare AI is typing');

  wrap.appendChild(avatar);
  wrap.appendChild(dots);
  DOM.messagesList.appendChild(wrap);
  typingIndicatorEl = wrap;
  scrollToBottom();
}

function hideTyping() {
  if (typingIndicatorEl) {
    typingIndicatorEl.remove();
    typingIndicatorEl = null;
  }
}

/* ─────────────────────────────────────────────
   10. SCROLL HELPER
───────────────────────────────────────────── */

function scrollToBottom() {
  DOM.chatContainer.scrollTo({
    top: DOM.chatContainer.scrollHeight,
    behavior: 'smooth',
  });
}

/* ─────────────────────────────────────────────
   11. EMERGENCY DETECTION
───────────────────────────────────────────── */

function checkForEmergency(text) {
  const lower = text.toLowerCase();
  return EMERGENCY_KEYWORDS.some(kw => lower.includes(kw));
}

function triggerEmergencyAlert() {
  DOM.emergencyAlert.classList.remove('hidden');
  // Auto-hide after 15 seconds
  setTimeout(() => DOM.emergencyAlert.classList.add('hidden'), 15000);
}

/* ─────────────────────────────────────────────
   12. AI RESPONSE ENGINE
───────────────────────────────────────────── */

/**
 * Generate a response based on user input and current state
 * @param {string} input - Cleaned user input
 * @returns {Promise<{text, html}>}
 */
async function generateResponse(input) {
  // Simulated async delay
  const delay = RESPONSE_DELAY_MIN + Math.random() * (RESPONSE_DELAY_MAX - RESPONSE_DELAY_MIN);
  await sleep(delay);

  const lower = input.toLowerCase();

  // ── Emergency ──
  if (checkForEmergency(input)) {
    triggerEmergencyAlert();
    return buildEmergencyResponse();
  }

  // ── Mode: Symptoms (follow-up) ──
  if (state.mode === 'symptoms') {
    return handleSymptomFlow(input);
  }

  // ── Mode: Wellness follow-up ──
  if (state.mode === 'wellness') {
    return handleWellnessFollowUp(input);
  }

  // ── Mode: Medication ──
  if (state.mode === 'medication') {
    return handleMedicationQuery(input);
  }

  // ── Keyword routing ──
  if (/\b(symptom|feel|pain|ache|hurt|sick|fever|cough|headache|nausea|dizzy|fatigue)\b/.test(lower)) {
    return startSymptomChecker(input);
  }
  if (/\b(mental|wellness|stress|anxious|anxiety|depress|mood|sad|overwhelm|panic|lonely|emotion)\b/.test(lower)) {
    return startWellnessMode();
  }
  if (/\b(medic|drug|pill|tablet|dose|dosage|prescription|medicine|ibuprofen|paracetamol|aspirin)\b/.test(lower)) {
    state.mode = 'medication';
    return handleMedicationQuery(input);
  }
  if (/\b(emergency|urgent|serious|severe|critical|ambulance|hospital|911|112)\b/.test(lower)) {
    triggerEmergencyAlert();
    return buildEmergencyResponse();
  }

  // ── Greetings ──
  if (/^(hello|hi|hey|good morning|good evening|greetings|howdy)\b/.test(lower)) {
    const name = state.profile?.name?.split(' ')[0] || 'there';
    return {
      text: '',
      html: buildHTML(`Hello, <strong>${name}!</strong> 👋 I'm MedCare AI, your personal health companion.<br><br>I can help you with:<br>` +
            buildListHTML(['🩺 Checking your symptoms', '🧠 Mental wellness support', '💊 General medication info', '🚨 Emergency guidance']) +
            '<br>What would you like to explore today?'),
    };
  }

  // ── Thanks ──
  if (/\b(thank|thanks|ty|appreciate)\b/.test(lower)) {
    return { text: "You're welcome! Remember — I'm always here if you need health guidance or support. Take care of yourself! 💙", html: null };
  }

  // ── How are you ──
  if (/how are you|how do you do/.test(lower)) {
    return { text: "I'm functioning at 100% and ready to help! More importantly — how are YOU doing today? Tell me about your health or how you're feeling. 😊", html: null };
  }

  // ── Default fallback ──
  return buildDefaultResponse(input);
}

/* ─── 12a. Symptom Checker ─── */
function startSymptomChecker(input) {
  state.mode = 'symptoms';
  state.symptomStep = 1;
  state.collectedSymptoms = input;

  const html = buildHTML(
    `<p>I understand you're not feeling well. Let me help assess your symptoms.</p>` +
    `<p class="bot-section-title">🔍 Quick Follow-up Questions</p>` +
    `<p>How long have you been experiencing these symptoms?</p>` +
    buildListHTML([
      'Less than 24 hours',
      '1–3 days',
      '4–7 days',
      'More than a week',
    ])
  );
  return { text: '', html };
}

function handleSymptomFlow(input) {
  const lower = input.toLowerCase();
  state.collectedSymptoms += '. ' + input;
  state.symptomStep++;

  if (state.symptomStep === 2) {
    const html = buildHTML(
      `<p>Got it. On a scale of 1–10, how would you rate the severity of your discomfort?</p>` +
      `<p class="bot-section-title">💢 Pain / Discomfort Scale</p>` +
      buildListHTML([
        '1–3: Mild, barely noticeable',
        '4–6: Moderate, affecting daily activities',
        '7–9: Severe, hard to function',
        '10: Unbearable — please seek emergency care',
      ])
    );
    return { text: '', html };
  }

  if (state.symptomStep === 3) {
    const html = buildHTML(
      `<p>Do you have any pre-existing medical conditions?</p>` +
      buildListHTML(['Diabetes', 'Hypertension', 'Heart condition', 'Respiratory issues', 'None / Not sure'])
    );
    return { text: '', html };
  }

  // Final analysis
  state.mode = null;
  state.symptomStep = 0;
  return buildSymptomAnalysis(state.collectedSymptoms);
}

function buildSymptomAnalysis(symptoms) {
  const lower = symptoms.toLowerCase();

  let risk = RISK.LOW;
  let conditions = [];
  let recommendations = [];
  let riskLabel = '🟢 Low Risk';
  let riskClass = 'risk-low';

  // Keyword-based heuristic analysis
  if (/fever|high temperature|chills/.test(lower)) {
    conditions.push('Viral infection (flu-like illness)');
    recommendations.push('Rest, stay hydrated, take paracetamol for fever');
    risk = RISK.LOW;
  }
  if (/cough|throat|cold/.test(lower)) {
    conditions.push('Upper respiratory tract infection');
    recommendations.push('Warm liquids, throat lozenges, steam inhalation');
    risk = RISK.LOW;
  }
  if (/headache|head pain|migraine/.test(lower)) {
    conditions.push('Tension headache or migraine');
    recommendations.push('Rest in a dark quiet room, over-the-counter pain relievers');
    if (/severe|worst|sudden/.test(lower)) {
      risk = RISK.URGENT;
      riskLabel = '🔴 Urgent';
      riskClass = 'risk-urgent';
    }
  }
  if (/nausea|vomit|stomach|abdominal/.test(lower)) {
    conditions.push('Gastroenteritis or digestive issue');
    recommendations.push('Stay hydrated with clear fluids, avoid solid food initially');
    risk = risk === RISK.LOW ? RISK.MEDIUM : risk;
  }
  if (/dizzy|lightheaded|vertigo/.test(lower)) {
    conditions.push('Dehydration, inner ear issue, or low blood pressure');
    recommendations.push('Sit or lie down, drink water, avoid sudden movements');
    risk = RISK.MEDIUM;
  }
  if (/chest|heart|palpitation/.test(lower)) {
    risk = RISK.URGENT;
    riskLabel = '🔴 Urgent';
    riskClass = 'risk-urgent';
    conditions.push('Possible cardiac or pulmonary issue — requires immediate assessment');
    recommendations.push('Seek emergency medical care immediately');
  }
  if (/7|8|9|10|severe|unbearable|worst/.test(lower)) {
    risk = RISK.URGENT;
    riskLabel = '🔴 Urgent';
    riskClass = 'risk-urgent';
  }

  // Defaults
  if (conditions.length === 0) {
    conditions.push('Non-specific symptoms — could be stress or mild infection');
    recommendations.push('Monitor your symptoms for 24–48 hours');
  }
  if (recommendations.length === 0) {
    recommendations.push('Consult a healthcare professional if symptoms worsen');
  }

  if (risk === RISK.MEDIUM) { riskLabel = '🟡 Moderate Risk'; riskClass = 'risk-medium'; }
  if (risk === RISK.URGENT) { triggerEmergencyAlert(); }

  const nextStep = risk === RISK.URGENT
    ? 'Seek emergency medical care immediately or call 112.'
    : risk === RISK.MEDIUM
      ? 'Schedule an appointment with your doctor within 1–2 days.'
      : 'Monitor symptoms at home and visit a GP if no improvement within 3–5 days.';

  const html = buildHTML(
    `<p>Here's my assessment based on what you've described:</p>` +
    `<p class="bot-section-title">🔬 Possible Condition(s)</p>` +
    buildListHTML(conditions) +
    `<hr class="bot-divider">` +
    `<p class="bot-section-title">💡 Recommendations</p>` +
    buildListHTML(recommendations) +
    `<hr class="bot-divider">` +
    `<p class="bot-section-title">⚡ Risk Level</p>` +
    `<span class="risk-badge ${riskClass}">${riskLabel}</span>` +
    `<hr class="bot-divider">` +
    `<p class="bot-section-title">➡️ Recommended Next Step</p>` +
    `<p style="font-size:0.88rem;margin-top:4px;">${nextStep}</p>` +
    `<p style="font-size:0.78rem;margin-top:10px;color:var(--text-muted);">⚕️ This is a general assessment, not a medical diagnosis. Always consult a qualified healthcare professional.</p>`
  );
  return { text: '', html };
}

/* ─── 12b. Mental Wellness Mode ─── */
function startWellnessMode() {
  state.mode = 'wellness';
  const html = buildHTML(
    `<p>I'm here to support you. 💚 Mental wellness is just as important as physical health.</p>` +
    `<p class="bot-section-title">🧠 How are you feeling right now?</p>` +
    `<p>You can select a mood using the smiley button below, or just describe what's on your mind in your own words.</p>`
  );
  // Show mood bar
  toggleMoodBar(true);
  return { text: '', html };
}

function handleMoodResponse(mood) {
  const responses = {
    happy: {
      icon: '😊',
      msg: "That's wonderful to hear! A positive mood is a great foundation for wellbeing.",
      tip: "Keep nurturing that positivity — share it with someone today.",
      tech: null,
    },
    sad: {
      icon: '😢',
      msg: "I'm sorry you're feeling sad. It's okay to feel this way — your feelings are valid.",
      tip: "Try journaling your thoughts, or reach out to a friend or family member.",
      tech: 'breathing',
    },
    anxious: {
      icon: '😰',
      msg: "Anxiety can feel overwhelming, but remember — it will pass. You are safe right now.",
      tip: "Let's try a quick breathing exercise to calm your nervous system.",
      tech: 'breathing',
    },
    angry: {
      icon: '😤',
      msg: "Anger is a natural emotion. Acknowledging it is the first step to managing it.",
      tip: "Before reacting, take 10 slow, deep breaths and ask: 'What is this anger protecting?'",
      tech: 'cooling',
    },
    overwhelmed: {
      icon: '😵',
      msg: "Feeling overwhelmed? That's your mind telling you it needs a break.",
      tip: "Break tasks into tiny steps. Do only ONE small thing right now.",
      tech: 'grounding',
    },
  };

  const r = responses[mood] || responses.sad;

  let techHTML = '';
  if (r.tech === 'breathing') {
    techHTML = `<div class="breathing-box">
      <strong>🌬️ Box Breathing (4-4-4-4)</strong><br>
      Inhale for <strong>4 seconds</strong> → Hold for <strong>4 seconds</strong> → Exhale for <strong>4 seconds</strong> → Hold for <strong>4 seconds</strong>.<br>
      Repeat 3–4 times. This activates your parasympathetic nervous system.
    </div>`;
  } else if (r.tech === 'grounding') {
    techHTML = `<div class="breathing-box">
      <strong>🌿 5-4-3-2-1 Grounding</strong><br>
      Name <strong>5 things you can see</strong> → <strong>4 you can touch</strong> → <strong>3 you can hear</strong> → <strong>2 you can smell</strong> → <strong>1 you can taste</strong>.
    </div>`;
  } else if (r.tech === 'cooling') {
    techHTML = `<div class="breathing-box">
      <strong>❄️ Cool-Down Technique</strong><br>
      Run cold water over your wrists, breathe deeply, and count backward from 10 slowly. Physical cooling reduces emotional heat.
    </div>`;
  }

  const html = buildHTML(
    `<p>${r.icon} <strong>${capitalize(mood)} — that's valid.</strong></p>` +
    `<p style="margin-top:6px;">${r.msg}</p>` +
    `<hr class="bot-divider">` +
    `<p class="bot-section-title">💡 CBT Tip</p>` +
    `<p style="font-size:0.88rem;">${r.tip}</p>` +
    techHTML +
    `<hr class="bot-divider">` +
    `<p style="font-size:0.83rem;color:var(--text-muted);">Remember: If you're struggling consistently, speaking with a therapist or counselor can make a significant difference. 💙</p>`
  );
  return { text: '', html };
}

function handleWellnessFollowUp(input) {
  const lower = input.toLowerCase();
  // Re-route if input contains mood or emotional keywords
  if (/happy|joy|great|good/.test(lower))      return handleMoodResponse('happy');
  if (/sad|depress|unhappy|grief|loss/.test(lower)) return handleMoodResponse('sad');
  if (/anxi|worry|panic|nervous|scared/.test(lower)) return handleMoodResponse('anxious');
  if (/angry|anger|mad|furious|frustrated/.test(lower)) return handleMoodResponse('angry');
  if (/overwhelm|too much|cant cope|stress/.test(lower)) return handleMoodResponse('overwhelmed');

  // Generic emotional support
  const html = buildHTML(
    `<p>Thank you for sharing that. 💙 It sounds like you're going through a lot.</p>` +
    `<p class="bot-section-title">🧠 Helpful Strategies</p>` +
    buildListHTML([
      'Practice self-compassion — speak to yourself as you would a close friend',
      'Set small, achievable goals to rebuild momentum',
      'Limit social media if it increases stress',
      'Consider talking to a mental health professional',
    ]) +
    `<div class="breathing-box">
      <strong>🌬️ Quick Reset Breath</strong><br>
      Breathe in through your nose for <strong>4 counts</strong>, then out through your mouth for <strong>8 counts</strong>. Do this 3 times.
    </div>`
  );
  return { text: '', html };
}

/* ─── 12c. Medication Info ─── */
function handleMedicationQuery(input) {
  state.mode = null;
  const lower = input.toLowerCase();

  const meds = {
    paracetamol:  { use: 'Pain relief, fever reduction', dose: 'Adults: 500mg–1g every 4–6 hours. Max 4g/day.', caution: 'Avoid alcohol. Risk of liver damage in overdose.', otc: true },
    acetaminophen:{ use: 'Pain relief, fever reduction', dose: 'Adults: 325–1000mg every 4–6 hours. Max 4g/day.', caution: 'Same as Paracetamol.', otc: true },
    ibuprofen:    { use: 'Anti-inflammatory, pain relief, fever', dose: 'Adults: 200–400mg every 4–6 hours. Max 1200mg/day (OTC).', caution: 'Take with food. Avoid if kidney issues or ulcers.', otc: true },
    aspirin:      { use: 'Pain relief, fever, blood thinning', dose: 'Adults: 325–650mg every 4–6 hours.', caution: 'NOT for under 16s. Risk of Reye\'s syndrome. Avoid if blood-thinning meds.', otc: true },
    amoxicillin:  { use: 'Bacterial infections (antibiotic)', dose: 'As prescribed by your doctor.', caution: 'Prescription required. Complete the full course.', otc: false },
    cetirizine:   { use: 'Allergy relief, hay fever, hives', dose: 'Adults: 10mg once daily.', caution: 'May cause drowsiness. Avoid alcohol.', otc: true },
    omeprazole:   { use: 'Acid reflux, heartburn, ulcers', dose: 'Adults: 20–40mg once daily before meals.', caution: 'Long-term use may affect bone density and B12 levels.', otc: true },
    metformin:    { use: 'Type 2 diabetes management', dose: 'As prescribed by your doctor.', caution: 'Prescription required. Take with meals.', otc: false },
    loratadine:   { use: 'Allergy relief, non-drowsy antihistamine', dose: 'Adults: 10mg once daily.', caution: 'Avoid alcohol.', otc: true },
  };

  // Find matching medication
  let found = null;
  let foundKey = '';
  for (const [name, info] of Object.entries(meds)) {
    if (lower.includes(name)) { found = info; foundKey = name; break; }
  }

  if (found) {
    const html = buildHTML(
      `<p class="bot-section-title">💊 ${capitalize(foundKey)}</p>` +
      `<p style="font-size:0.88rem;margin-bottom:8px;">Here's general information about this medication:</p>` +
      `<span class="risk-badge risk-${found.otc ? 'low' : 'medium'}">${found.otc ? '✓ Over-the-Counter' : '⚠ Prescription Only'}</span>` +
      `<hr class="bot-divider">` +
      `<p class="bot-section-title">🎯 Primary Use</p>` +
      `<p style="font-size:0.88rem;">${found.use}</p>` +
      `<p class="bot-section-title">📏 Typical Dosage</p>` +
      `<p style="font-size:0.88rem;">${found.dose}</p>` +
      `<p class="bot-section-title">⚠️ Important Cautions</p>` +
      `<p style="font-size:0.88rem;">${found.caution}</p>` +
      `<hr class="bot-divider">` +
      `<p style="font-size:0.78rem;color:var(--text-muted);">⚕️ Always read the label and consult your pharmacist or doctor before taking any medication.</p>`
    );
    return { text: '', html };
  }

  // Generic medication question
  const html = buildHTML(
    `<p>I can provide general information about common medications.</p>` +
    `<p class="bot-section-title">💊 Medications I Know About</p>` +
    buildListHTML(['Paracetamol / Acetaminophen', 'Ibuprofen', 'Aspirin', 'Cetirizine', 'Loratadine', 'Omeprazole', 'Amoxicillin (general info)', 'Metformin (general info)']) +
    `<p style="margin-top:10px;font-size:0.88rem;">Which medication would you like to know more about? Or skip this and describe your symptoms instead.</p>` +
    `<hr class="bot-divider">` +
    `<p style="font-size:0.78rem;color:var(--text-muted);">⚕️ Never self-medicate without professional guidance.</p>`
  );
  return { text: '', html };
}

/* ─── 12d. Emergency Response ─── */
function buildEmergencyResponse() {
  const html = buildHTML(
    `<p>🚨 <strong>I've detected signs of an emergency in your message.</strong></p>` +
    `<hr class="bot-divider">` +
    `<p class="bot-section-title" style="color:var(--clr-danger)">⚡ Immediate Steps</p>` +
    buildListHTML([
      'Call emergency services immediately — <strong>112 (India/EU), 911 (US), 999 (UK)</strong>',
      'Stay calm and do not leave the person alone',
      'Describe the situation clearly to the dispatcher',
      'Follow the dispatcher\'s instructions carefully',
      'Unlock the door and wait for help to arrive',
    ]) +
    `<span class="risk-badge risk-urgent">🔴 Urgent — Seek Immediate Help</span>` +
    `<hr class="bot-divider">` +
    `<p style="font-size:0.83rem;">If you need to talk, I'm still here. But please prioritize getting professional emergency help right now. 💙</p>`
  );
  return { text: '', html };
}

/* ─── 12e. Default Response ─── */
function buildDefaultResponse(input) {
  const name = state.profile?.name?.split(' ')[0] || '';
  const suggestions = [
    'Tell me about any symptoms you\'re experiencing',
    'Describe how you\'re feeling emotionally',
    'Ask about a specific medication',
    'Mention if this is an emergency',
  ];
  const html = buildHTML(
    `<p>Thanks, ${name ? `<strong>${name}</strong>, ` : ''}I'm here to help!</p>` +
    `<p style="margin-top:6px;">I'm best at helping with health-related topics. Here are some things I can assist with:</p>` +
    `<p class="bot-section-title">💬 Try Asking Me To...</p>` +
    buildListHTML(suggestions) +
    `<p style="margin-top:10px;font-size:0.87rem;color:var(--text-muted);">Or use the quick action buttons to get started quickly.</p>`
  );
  return { text: '', html };
}

/* ─────────────────────────────────────────────
   13. HTML BUILDER HELPERS
───────────────────────────────────────────── */

/** Wrap inner HTML in a standard container */
function buildHTML(inner) {
  return `<div class="bot-content">${inner}</div>`;
}

/** Build an unordered list HTML */
function buildListHTML(items) {
  const lis = items.map(i => `<li>${i}</li>`).join('');
  return `<ul class="bot-list">${lis}</ul>`;
}

/** Capitalize first letter */
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Promise-based sleep */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ─────────────────────────────────────────────
   14. USER INPUT HANDLING
───────────────────────────────────────────── */

async function handleSend() {
  const raw = DOM.userInput.value.trim();
  if (!raw) return;

  // Clear input
  DOM.userInput.value = '';
  DOM.userInput.style.height = 'auto';
  DOM.sendBtn.disabled = true;

  // Add user message
  addMessage('user', raw, null);

  // Show typing
  showTyping();

  try {
    const response = await generateResponse(raw);
    hideTyping();
    if (response.html) {
      addMessage('bot', response.text || '[See message]', response.html);
    } else {
      addMessage('bot', response.text, null);
    }
  } catch (err) {
    hideTyping();
    addMessage('bot', 'I apologize — something went wrong. Please try again. If this is an emergency, call 112 immediately.', null);
    console.error('Response generation error:', err);
  }
}

/* ─────────────────────────────────────────────
   15. MOOD BAR TOGGLE
───────────────────────────────────────────── */

function toggleMoodBar(forceOpen) {
  const shouldOpen = forceOpen !== undefined ? forceOpen : !state.moodOpen;
  state.moodOpen = shouldOpen;
  DOM.moodBar.classList.toggle('visible', shouldOpen);
  DOM.wellnessToggle.setAttribute('aria-expanded', String(shouldOpen));
}

/* ─────────────────────────────────────────────
   16. TOAST NOTIFICATION
───────────────────────────────────────────── */

let toastTimeout = null;

function showToast(message) {
  let toast = document.getElementById('toast-notification');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast-notification';
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 2500);
}

/* ─────────────────────────────────────────────
   17. INITIALIZATION
───────────────────────────────────────────── */

function initChat() {
  loadHistory();
  // If no history, show welcome + send intro message
  if (state.messages.length === 0) {
    const name = state.profile?.name?.split(' ')[0] || 'there';
    const intro = {
      role: 'bot',
      text: '',
      html: buildHTML(
        `<p>👋 Hello, <strong>${name}!</strong> Welcome to <strong>MedCare AI</strong>.</p>` +
        `<p style="margin-top:6px;">I'm your personal health assistant — here to help with:</p>` +
        buildListHTML([
          '🩺 Symptom assessment & guidance',
          '🧠 Mental wellness & CBT support',
          '💊 General medication information',
          '🚨 Emergency detection & advice',
        ]) +
        `<p style="margin-top:10px;font-size:0.88rem;">Use the quick buttons below or type your question. Everything stays private on your device. 🔒</p>`
      ),
      time: formatTime(new Date()),
    };
    state.messages.push(intro);
    saveHistory();
    renderMessage(intro);
  }
}

function init() {
  initTheme();
  loadProfile();
  bindEvents();
}

/* ─────────────────────────────────────────────
   18. EVENT BINDING
───────────────────────────────────────────── */

function bindEvents() {
  // ── Profile Form ──
  DOM.profileForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name   = DOM.userName.value.trim();
    const age    = DOM.userAge.value.trim();
    const gender = DOM.userGender.value;

    if (!name || !age || !gender) {
      showToast('Please fill in all required fields.');
      return;
    }
    const profile = {
      name,
      age: parseInt(age, 10),
      gender,
      history: DOM.userHistory.value.trim() || null,
    };
    saveProfile(profile);
    DOM.profileModal.classList.add('hidden');
    initChat();
  });

  // ── Theme Toggle ──
  DOM.themeToggleBtn.addEventListener('click', toggleTheme);

  // ── Clear Chat ──
  DOM.clearChatBtn.addEventListener('click', () => {
    if (DOM.messagesList.children.length === 0) {
      showToast('No chat history to clear.');
      return;
    }
    // Simple confirm
    const confirmed = confirm('Clear all chat history? This cannot be undone.');
    if (confirmed) {
      clearHistory();
      state.mode = null;
      toggleMoodBar(false);
    }
  });

  // ── Quick Action Buttons ──
  document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const msg = btn.getAttribute('data-message');
      if (msg) {
        DOM.userInput.value = msg;
        handleSend();
      }
    });
  });

  // ── Mood Buttons ──
  DOM.moodButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const mood = btn.getAttribute('data-mood');
      if (!mood) return;

      // Add as user message
      const moodLabels = {
        happy: '😊 I\'m feeling happy',
        sad: '😢 I\'m feeling sad',
        anxious: '😰 I\'m feeling anxious',
        angry: '😤 I\'m feeling angry',
        overwhelmed: '😵 I\'m feeling overwhelmed',
      };
      const displayMsg = moodLabels[mood] || mood;
      DOM.userInput.value = displayMsg;

      // Close mood bar
      toggleMoodBar(false);
      handleSend();
    });
  });

  // ── Wellness Toggle Button ──
  DOM.wellnessToggle.addEventListener('click', () => toggleMoodBar());

  // ── Input Typing ──
  DOM.userInput.addEventListener('input', () => {
    // Auto-resize textarea
    DOM.userInput.style.height = 'auto';
    DOM.userInput.style.height = Math.min(DOM.userInput.scrollHeight, 120) + 'px';
    // Enable/disable send button
    DOM.sendBtn.disabled = !DOM.userInput.value.trim();
  });

  // ── Enter to send (Shift+Enter for newline) ──
  DOM.userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!DOM.sendBtn.disabled) handleSend();
    }
  });

  // ── Send Button ──
  DOM.sendBtn.addEventListener('click', handleSend);

  // ── Emergency Close ──
  DOM.emergencyClose.addEventListener('click', () => {
    DOM.emergencyAlert.classList.add('hidden');
  });

  // ── Keyboard trap for modal ──
  DOM.profileModal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // Don't allow closing without filling the form
    }
  });
}

/* ─────────────────────────────────────────────
   19. BOOT
───────────────────────────────────────────── */

// Wait for DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
