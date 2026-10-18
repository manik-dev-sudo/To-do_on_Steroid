/**
 * To-Do On Steroids - Application Logic
 * Voice-First AI Taskmaster powered by Web Speech API & Google Gemini Flash
 */
import './app.css';

// ============================================================================
// State & Storage Keys
// ============================================================================
const STORAGE_KEYS = {
  TASKS: 'steroid_todo_tasks_v1',
  API_KEY: 'steroid_todo_gemini_api_key',
  MODEL: 'steroid_todo_gemini_model',
  LANGUAGE: 'steroid_todo_speech_lang',
  SOUND_FX: 'steroid_todo_sound_fx'
};

const state = {
  tasks: [],
  apiKey: '',
  model: 'gemini-2.5-flash',
  language: 'en-US',
  soundFxEnabled: true,
  isRecording: false,
  recognition: null,
  pendingApproval: null, // holds AI proposed changes { newTasks: [], completedTaskIds: [], summary: '' }
  deferredPWAInstallPrompt: null,
  completedCollapsed: false,
  filterHistoryDate: null
};

// ============================================================================
// Web Audio API Synthesizer (Zero-Dependency Sound FX)
// ============================================================================
class SoundEffects {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
  }

  playMicStart() {
    if (!state.soundFxEnabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  playMicStop() {
    if (!state.soundFxEnabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(780, now);
    osc.frequency.exponentialRampToValueAtTime(390, now + 0.15);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  playTaskComplete() {
    if (!state.soundFxEnabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.04);
      gain.gain.setValueAtTime(0.15, now + idx * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.35);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + idx * 0.04);
      osc.stop(now + idx * 0.04 + 0.35);
    });
  }

  playSuccessChime() {
    if (!state.soundFxEnabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    [440, 554.37, 659.25, 880].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.06);
      gain.gain.setValueAtTime(0.12, now + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.4);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.4);
    });
  }
}

const sounds = new SoundEffects();

// ============================================================================
// Canvas Audio Wave Visualizer Animation
// ============================================================================
let visualizerAnimId = null;

function startVisualizer() {
  const canvas = document.getElementById('visualizer-canvas');
  if (!canvas) return;
  canvas.classList.add('active');
  const ctx = canvas.getContext('2d');
  let step = 0;

  function renderWave() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const bars = 24;
    const barWidth = 6;
    const gap = 4;
    const totalW = bars * (barWidth + gap);
    const startX = (canvas.width - totalW) / 2;

    for (let i = 0; i < bars; i++) {
      const h = 6 + Math.abs(Math.sin((step + i * 0.35)) * 24);
      const x = startX + i * (barWidth + gap);
      const y = (canvas.height - h) / 2;

      const grad = ctx.createLinearGradient(0, y, 0, y + h);
      grad.addColorStop(0, '#f43f5e');
      grad.addColorStop(1, '#8b5cf6');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, h, 3);
      ctx.fill();
    }
    step += 0.15;
    visualizerAnimId = requestAnimationFrame(renderWave);
  }

  renderWave();
}

function stopVisualizer() {
  if (visualizerAnimId) {
    cancelAnimationFrame(visualizerAnimId);
    visualizerAnimId = null;
  }
  const canvas = document.getElementById('visualizer-canvas');
  if (canvas) {
    canvas.classList.remove('active');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

// ============================================================================
// Helper Utilities
// ============================================================================
function getTodayDateString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function generateId() {
  return 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  
  let iconSvg = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.5">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="16" x2="12" y2="12"></line>
      <line x1="12" y1="8" x2="12.01" y2="8"></line>
    </svg>`;
  
  if (type === 'success') {
    iconSvg = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>`;
  } else if (type === 'error') {
    iconSvg = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2.5">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="15" y1="9" x2="9" y2="15"></line>
        <line x1="9" y1="9" x2="15" y2="15"></line>
      </svg>`;
  }

  toast.innerHTML = `${iconSvg} <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ============================================================================
// Local Storage Load & Save
// ============================================================================
function loadStateFromStorage() {
  try {
    const savedTasks = localStorage.getItem(STORAGE_KEYS.TASKS);
    if (savedTasks) {
      state.tasks = JSON.parse(savedTasks);
    } else {
      // First-time friendly initial starter tasks
      const today = getTodayDateString();
      state.tasks = [
        {
          id: generateId(),
          title: "Send daily project update email",
          time: "09:30 AM",
          date: today,
          category: "Work",
          priority: "high",
          completed: false,
          completedAt: null,
          createdAt: new Date().toISOString()
        },
        {
          id: generateId(),
          title: "30-minute evening walking session",
          time: "06:00 PM",
          date: today,
          category: "Health",
          priority: "medium",
          completed: false,
          completedAt: null,
          createdAt: new Date().toISOString()
        }
      ];
      saveTasksToStorage();
    }

    state.apiKey = localStorage.getItem(STORAGE_KEYS.API_KEY) || '';
    state.model = localStorage.getItem(STORAGE_KEYS.MODEL) || 'gemini-2.5-flash';
    // Auto-migrate deprecated/non-existent models to gemini-2.5-flash
    const knownBadModels = ['gemini-3.8-flash', 'gemini-3.8-pro', 'gemini-2.0-flash'];
    if (knownBadModels.includes(state.model) || !state.model) {
      state.model = 'gemini-2.5-flash';
      localStorage.setItem(STORAGE_KEYS.MODEL, state.model);
    }
    state.language = localStorage.getItem(STORAGE_KEYS.LANGUAGE) || 'en-US';
    state.soundFxEnabled = localStorage.getItem(STORAGE_KEYS.SOUND_FX) !== 'false';
  } catch (err) {
    console.error('Error loading localStorage:', err);
  }
}

function saveTasksToStorage() {
  try {
    localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(state.tasks));
  } catch (err) {
    console.error('Error saving tasks to localStorage:', err);
  }
}

// ============================================================================
// UI Rendering: Tasks (Active & Completed with Faded Strikethrough)
// ============================================================================
function renderTasks() {
  const activeListEl = document.getElementById('active-tasks-list');
  const completedListEl = document.getElementById('completed-tasks-list');
  const activeCountEl = document.getElementById('active-tasks-count');
  const completedCountEl = document.getElementById('completed-tasks-count');

  if (!activeListEl || !completedListEl) return;

  const todayStr = getTodayDateString();
  // Filter tasks belonging to today
  const todayTasks = state.tasks.filter(t => t.date === todayStr);
  const activeTasks = todayTasks.filter(t => !t.completed);
  const completedTasks = todayTasks.filter(t => t.completed);

  activeCountEl.textContent = activeTasks.length;
  completedCountEl.textContent = completedTasks.length;

  // Render Active Tasks
  if (activeTasks.length === 0) {
    activeListEl.innerHTML = `
      <div class="tasks-empty-state">
        <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 14 14"></polyline>
        </svg>
        <h4 style="font-size: 1.1rem; color: var(--text-primary); margin-bottom: 0.35rem;">All tasks cleared for today!</h4>
        <p style="font-size: 0.875rem;">Tap the mic above and speak your plans, or click "+ New Task" to add one manually.</p>
      </div>`;
  } else {
    activeListEl.innerHTML = activeTasks.map(task => renderTaskCard(task)).join('');
  }

  // Render Completed Tasks (Soft Faded & Cut)
  if (completedTasks.length === 0) {
    completedListEl.innerHTML = `
      <div style="font-size: 0.85rem; color: var(--text-muted); font-style: italic; padding: 0.5rem 0;">
        No completed tasks yet. Tell the AI "I completed [task]" or check a task above to mark it done.
      </div>`;
  } else {
    completedListEl.innerHTML = completedTasks.map(task => renderTaskCard(task)).join('');
  }

  attachTaskEventListeners();
  renderHistoryView();
}

function renderTaskCard(task) {
  const isDone = task.completed;
  return `
    <div class="task-card ${isDone ? 'is-completed' : ''}" data-task-id="${task.id}">
      <div class="task-left">
        <div class="custom-checkbox ${isDone ? 'checked' : ''}" data-action="toggle-complete" data-task-id="${task.id}" title="${isDone ? 'Mark as incomplete' : 'Mark as complete'}">
          <svg viewBox="0 0 24 24" fill="none">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        <div class="task-content">
          <div class="task-title">${escapeHtml(task.title)}</div>
          <div class="task-meta">
            ${task.time ? `
              <span class="task-badge-time">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                ${escapeHtml(task.time)}
              </span>` : ''}
            
            ${task.category ? `
              <span class="task-badge-category">
                ${escapeHtml(task.category)}
              </span>` : ''}

            ${task.priority ? `
              <span class="task-badge-priority priority-${task.priority}">
                ${escapeHtml(task.priority)}
              </span>` : ''}

            ${isDone && task.completedAt ? `
              <span style="font-size: 0.725rem; color: var(--text-muted);">
                Done at ${new Date(task.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>` : ''}
          </div>
        </div>
      </div>

      <div class="task-actions">
        <button class="btn-task-action delete" data-action="delete" data-task-id="${task.id}" title="Delete task">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    </div>`;
}

function attachTaskEventListeners() {
  document.querySelectorAll('[data-action="toggle-complete"]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const taskId = btn.getAttribute('data-task-id');
      toggleTaskCompletion(taskId);
    };
  });

  document.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const taskId = btn.getAttribute('data-task-id');
      deleteTask(taskId);
    };
  });
}

function toggleTaskCompletion(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;

  task.completed = !task.completed;
  if (task.completed) {
    task.completedAt = new Date().toISOString();
    sounds.playTaskComplete();
    showToast(`✓ Marked "${task.title}" as completed`, 'success');
  } else {
    task.completedAt = null;
    showToast(`Restored "${task.title}" to active tasks`);
  }

  saveTasksToStorage();
  renderTasks();
}

function deleteTask(taskId) {
  state.tasks = state.tasks.filter(t => t.id !== taskId);
  saveTasksToStorage();
  renderTasks();
  showToast('Task removed');
}

function escapeHtml(val) {
  if (val === null || val === undefined) return '';
  let str = '';
  if (typeof val === 'string') {
    str = val;
  } else if (typeof val === 'object') {
    try {
      str = val.text || val.message || JSON.stringify(val);
    } catch (e) {
      str = String(val);
    }
  } else {
    str = String(val);
  }
  return str.replace(/[&<>"']/g, function(m) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m];
  });
}

// ============================================================================
// Web Speech API Integration (Chrome Voice Recording)
// ============================================================================
function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn('Web Speech API not supported in this browser.');
    const hint = document.getElementById('mic-hint-text');
    if (hint) {
      hint.innerHTML = '<span style="color: #fbbf24;">Note: Speech recognition works best in Google Chrome. You can also type directly in the box below!</span>';
    }
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = state.language;

  recognition.onstart = () => {
    state.isRecording = true;
    const micBtn = document.getElementById('btn-mic');
    const statusText = document.getElementById('mic-status-text');
    if (micBtn) micBtn.classList.add('recording');
    if (statusText) statusText.textContent = 'Listening... Speak your tasks or completions';
    sounds.playMicStart();
    startVisualizer();
  };

  recognition.onresult = (event) => {
    let interim = '';
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interim += event.results[i][0].transcript;
      }
    }

    const transcriptInput = document.getElementById('transcript-input');
    if (transcriptInput) {
      if (finalTranscript) {
        const current = transcriptInput.value.trim();
        transcriptInput.value = current ? current + ' ' + finalTranscript.trim() : finalTranscript.trim();
      } else if (interim) {
        // live preview
        const current = transcriptInput.value.replace(/\s*\(listening\.\.\..*$/, '');
        transcriptInput.value = (current ? current + ' ' : '') + `(${interim.trim()}...)`;
      }
    }
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    stopRecording();
    if (event.error === 'not-allowed') {
      showToast('Microphone access denied. Please allow microphone permissions in Chrome.', 'error');
    } else if (event.error !== 'no-speech') {
      showToast('Speech recognition error: ' + event.error, 'error');
    }
  };

  recognition.onend = () => {
    if (state.isRecording) {
      // Re-trigger if continuous stopped unexpectedly unless user clicked stop
      try {
        recognition.start();
      } catch (e) {
        stopRecording();
      }
    } else {
      stopRecording();
    }
  };

  state.recognition = recognition;
}

function startRecording() {
  if (!state.recognition) setupSpeechRecognition();
  if (!state.recognition) {
    showToast('Speech Recognition not supported in this browser. Please use Chrome.', 'error');
    return;
  }
  try {
    state.recognition.lang = state.language;
    state.recognition.start();
  } catch (err) {
    console.warn('SpeechRecognition start error:', err);
  }
}

function stopRecording() {
  state.isRecording = false;
  if (state.recognition) {
    try {
      state.recognition.stop();
    } catch (e) {}
  }
  const micBtn = document.getElementById('btn-mic');
  const statusText = document.getElementById('mic-status-text');
  if (micBtn) micBtn.classList.remove('recording');
  if (statusText) statusText.textContent = 'Tap to Speak Your Routine & Tasks';
  sounds.playMicStop();
  stopVisualizer();

  // Clean any temporary (listening...) tag from textarea
  const transcriptInput = document.getElementById('transcript-input');
  if (transcriptInput) {
    transcriptInput.value = transcriptInput.value.replace(/\s*\([^)]*\.\.\.\)/g, '').trim();
  }
}

function toggleRecording() {
  if (state.isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
}

// ============================================================================
// ============================================================================
// Status Banner & Robust JSON Extractor
// ============================================================================
function setAiBanner(type, message, actionsHtml = '') {
  const banner = document.getElementById('ai-status-banner');
  const msgEl = document.getElementById('ai-status-message');
  if (!banner || !msgEl) return;

  if (!type) {
    banner.style.display = 'none';
    return;
  }

  banner.style.display = 'flex';
  if (type === 'loading') {
    banner.style.background = 'rgba(139, 92, 246, 0.15)';
    banner.style.borderColor = 'rgba(139, 92, 246, 0.4)';
    banner.style.color = '#d8b4fe';
    msgEl.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="spin">
        <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
        <path d="M12 2a10 10 0 0 1 10 10"></path>
      </svg>
      <span>${escapeHtml(message)}</span>
    `;
  } else if (type === 'error') {
    banner.style.background = 'rgba(244, 63, 94, 0.15)';
    banner.style.borderColor = 'rgba(244, 63, 94, 0.4)';
    banner.style.color = '#fecdd3';
    msgEl.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2.5" style="flex-shrink:0;">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <div style="flex: 1;">
        <div style="font-weight: 600;">${escapeHtml(message)}</div>
        ${actionsHtml ? `<div style="margin-top: 0.35rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">${actionsHtml}</div>` : ''}
      </div>
    `;
  } else if (type === 'success') {
    banner.style.background = 'rgba(16, 185, 129, 0.15)';
    banner.style.borderColor = 'rgba(16, 185, 129, 0.4)';
    banner.style.color = '#a7f3d0';
    msgEl.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>
      <span>${escapeHtml(message)}</span>
    `;
    setTimeout(() => {
      if (banner && banner.style.display !== 'none' && banner.style.color.includes('a7f3d0')) {
        banner.style.display = 'none';
      }
    }, 3500);
  }
}

function extractJsonFromText(rawText) {
  if (!rawText) return null;
  // 1. Direct parse
  try {
    return JSON.parse(rawText.trim());
  } catch (e) {}

  // 2. Markdown code block
  const codeBlockMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch (e) {}
  }

  // 3. Find outer braces { ... }
  const firstBrace = rawText.indexOf('{');
  const lastBrace = rawText.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(rawText.slice(firstBrace, lastBrace + 1));
    } catch (e) {}
  }

  return null;
}

function parseTasksOffline(userText) {
  const text = (userText || '').trim();
  
  // Extract time like "11 pm", "11:00 PM", "2:30 pm", "10 am"
  let extractedTime = "";
  const timeMatch = text.match(/(?:at\s+)?(\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b)/i);
  if (timeMatch) {
    extractedTime = timeMatch[1].toUpperCase();
    if (!extractedTime.includes(':')) {
      extractedTime = extractedTime.replace(/(\d{1,2})\s*(AM|PM)/i, '$1:00 $2');
    }
  }

  // Determine category
  let category = "Personal";
  const lower = text.toLowerCase();
  if (lower.includes('call') || lower.includes('meeting') || lower.includes('client') || lower.includes('project') || lower.includes('office') || lower.includes('email')) {
    category = lower.includes('meeting') ? "Meeting" : "Work";
  } else if (lower.includes('personal') || lower.includes('home') || lower.includes('family') || lower.includes('friend')) {
    category = "Personal";
  } else if (lower.includes('workout') || lower.includes('gym') || lower.includes('walk') || lower.includes('run') || lower.includes('doctor') || lower.includes('dentist')) {
    category = "Health";
  }

  // Determine priority
  let priority = "medium";
  if (lower.includes('urgent') || lower.includes('asap') || lower.includes('important') || lower.includes('critical')) {
    priority = "high";
  }

  // Detect completion of active tasks
  const completedTaskIds = [];
  state.tasks.forEach(task => {
    if (!task.completed) {
      const words = task.title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const isMentioned = words.some(w => lower.includes(w));
      const hasCompletedKeyword = lower.includes('completed') || lower.includes('finished') || lower.includes('done') || lower.includes('did');
      if (isMentioned && hasCompletedKeyword) {
        completedTaskIds.push(task.id);
      }
    }
  });

  // Clean task title
  let cleanTitle = text
    .replace(/^i (have to|need to|want to|must|will)\s+/i, '')
    .replace(/\s+on \d{1,2}(?:st|nd|rd|th)?\s+[a-z]+(?:\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?/i, '')
    .replace(/\s+at \d{1,2}(?::\d{2})?\s*(?:am|pm)?/i, '')
    .trim();

  cleanTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);

  return {
    summary: `Parsed 1 task (${category} at ${extractedTime || 'today'}).`,
    new_tasks: [
      {
        title: cleanTitle || text,
        time: extractedTime,
        category: category,
        priority: priority
      }
    ],
    completed_task_ids: completedTaskIds
  };
}

// ============================================================================
// Google Gemini AI Task Analyzer (Intelligent Speech Parsing & Task Resolution)
// ============================================================================
async function analyzeWithGemini() {
  const transcriptInput = document.getElementById('transcript-input');
  const userText = transcriptInput ? transcriptInput.value.trim() : '';

  if (!userText) {
    showToast('Please speak or type some tasks first!', 'error');
    setAiBanner('error', 'Please speak or type your tasks in the box first.');
    return;
  }

  const analyzeBtn = document.getElementById('btn-ai-analyze');
  const originalBtnHtml = analyzeBtn.innerHTML;
  analyzeBtn.disabled = true;
  analyzeBtn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="spin">
      <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
      <path d="M12 2a10 10 0 0 1 10 10"></path>
    </svg>
    <span>Analyzing with Gemini...</span>`;

  setAiBanner('loading', 'Contacting Google Gemini AI to analyze your tasks...');

  const todayStr = getTodayDateString();
  const currentActiveTasks = state.tasks
    .filter(t => !t.completed)
    .map(t => ({ id: t.id, title: t.title, time: t.time, category: t.category }));

  const systemPrompt = `You are the intelligent core of "To-Do on Steroids".
Analyze the user's spoken or typed statement regarding their daily routine, tasks, and progress.
Current Date: ${todayStr}. Current Local Time: ${new Date().toLocaleTimeString()}.

Existing active tasks currently on the user's list:
${JSON.stringify(currentActiveTasks, null, 2)}

Your job:
1. Identify any tasks the user says they COMPLETED or finished (e.g. "I completed my email and walking", "finished workout"). Match them against the existing active tasks and return their "id" in "completed_task_ids".
2. Extract any NEW tasks or plans the user wants to add (e.g. "new meeting at 10:00 PM", "buy groceries").
   - For each new task, provide:
     - "title": Clean, concise task title
     - "time": Spoken time formatted like "10:00 PM", "2:30 PM", or "" if none mentioned
     - "category": Choose one of "Work", "Personal", "Health", "Meeting", "Routine"
     - "priority": Choose "high", "medium", or "low" based on urgency
3. Provide a brief 1-sentence friendly confirmation in "summary".

Respond STRICTLY with a valid JSON object matching this schema:
{
  "summary": "Completed 2 tasks and added 1 new meeting.",
  "new_tasks": [
    {
      "title": "Meeting with team",
      "time": "10:00 PM",
      "category": "Meeting",
      "priority": "high"
    }
  ],
  "completed_task_ids": ["task_id_1"]
}`;

  let parsedResult = null;
  let lastErrorMsg = '';

  // Check if API key is present
  if (state.apiKey && state.apiKey.trim().length > 10) {
    // Models to try in cascade order
    const candidateModels = [
      normalizeModelName(state.model),
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash'
    ];
    const modelsToTry = [...new Set(candidateModels.filter(Boolean))];

    for (const modelToTest of modelsToTry) {
      setAiBanner('loading', `Analyzing with Gemini model: ${modelToTest}...`);

      // Attempt 1: With generationConfig
      // Attempt 2: Plain JSON prompt without generationConfig
      const attempts = [
        { withConfig: true },
        { withConfig: false }
      ];

      for (const attempt of attempts) {
        try {
          const cleanModel = normalizeModelName(modelToTest);
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${encodeURIComponent(state.apiKey.trim())}`;
          
          const requestBody = {
            contents: [
              {
                role: 'user',
                parts: [{ text: `${systemPrompt}\n\nUser Input: "${userText}"` }]
              }
            ]
          };

          if (attempt.withConfig) {
            requestBody.generationConfig = {
              responseMimeType: 'application/json',
              temperature: 0.2
            };
          }

          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            const msg = errData.error?.message || `HTTP ${res.status}`;
            lastErrorMsg = msg;
            // If the error suggests another model, continue to next model
            const suggested = extractSuggestedModel(msg);
            if (suggested && !modelsToTry.includes(suggested)) {
              modelsToTry.push(suggested);
            }
            continue;
          }

          const data = await res.json();
          const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (candidateText) {
            parsedResult = extractJsonFromText(candidateText);
            if (parsedResult) {
              // Successfully got valid JSON! Update active model if changed
              if (state.model !== modelToTest) {
                state.model = modelToTest;
                localStorage.setItem(STORAGE_KEYS.MODEL, state.model);
                updateModelUI();
              }
              break;
            }
          }
        } catch (fetchErr) {
          lastErrorMsg = fetchErr.message;
        }
      }

      if (parsedResult) break;
    }
  } else {
    lastErrorMsg = 'Google AI Studio API key is missing or not configured.';
  }

  // Handle outcome
  if (parsedResult) {
    setAiBanner('success', '✓ Tasks analyzed successfully by Gemini AI!');
    openApprovalModal(parsedResult);
  } else {
    // If Gemini failed or key missing, use the intelligent offline task parser so user is NEVER blocked
    console.warn('AI analysis fell back to local parser. Last error:', lastErrorMsg);
    const offlineResult = parseTasksOffline(userText);
    offlineResult.summary = `⚡ Quick-Parsed: ${offlineResult.summary} (AI Note: ${lastErrorMsg || 'offline'})`;
    
    setAiBanner('error', `AI Note: ${lastErrorMsg || 'API unavailable'}. Extracted your task with Quick Parser below.`, `
      <button type="button" class="btn-secondary" style="padding: 0.2rem 0.6rem; font-size: 0.75rem;" onclick="switchTab('page-settings')">⚙️ Check API Key in Settings</button>
    `);

    // Open Approval Modal anyway!
    openApprovalModal(offlineResult);
  }

  analyzeBtn.disabled = false;
  analyzeBtn.innerHTML = originalBtnHtml;
}

// ============================================================================
// Modal Component: AI Action Approval Pop-up (As Requested)
// ============================================================================
function openApprovalModal(aiResult) {
  const modal = document.getElementById('modal-approval');
  const summaryEl = document.getElementById('approval-ai-summary');
  const addListEl = document.getElementById('approval-add-list');
  const completeListEl = document.getElementById('approval-complete-list');
  const addCountEl = document.getElementById('approval-add-count');
  const completeCountEl = document.getElementById('approval-complete-count');
  const addGroup = document.getElementById('approval-group-add');
  const completeGroup = document.getElementById('approval-group-complete');

  if (!modal) {
    console.error('Modal #modal-approval element not found in DOM!');
    return;
  }

  try {
    const rawNewTasks = Array.isArray(aiResult?.new_tasks) ? aiResult.new_tasks : [];
    const rawCompletedIds = Array.isArray(aiResult?.completed_task_ids) ? aiResult.completed_task_ids : [];

    const safeNewTasks = rawNewTasks.map((t, idx) => {
      let titleStr = 'New Task';
      if (typeof t === 'string') {
        titleStr = t;
      } else if (t && typeof t.title === 'string') {
        titleStr = t.title;
      } else if (t && t.title) {
        titleStr = String(t.title);
      }

      let timeStr = '';
      if (t && typeof t.time === 'string') {
        timeStr = t.time;
      } else if (t && t.time) {
        timeStr = String(t.time);
      }

      return {
        title: titleStr,
        time: timeStr,
        category: (t && typeof t.category === 'string') ? t.category : 'General',
        priority: (t && typeof t.priority === 'string') ? t.priority : 'medium',
        tempId: 'new_' + idx
      };
    });

    const safeCompletedIds = rawCompletedIds.map(id => String(id));

    let summaryText = 'AI parsed actions based on your input.';
    if (typeof aiResult?.summary === 'string') {
      summaryText = aiResult.summary;
    } else if (aiResult?.summary && typeof aiResult.summary === 'object') {
      summaryText = aiResult.summary.text || JSON.stringify(aiResult.summary);
    }

    state.pendingApproval = {
      newTasks: safeNewTasks,
      completedTaskIds: safeCompletedIds,
      summary: summaryText
    };

    if (summaryEl) {
      summaryEl.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0; margin-top: 2px;">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
        <div>${escapeHtml(state.pendingApproval.summary)}</div>`;
    }

    if (addCountEl) addCountEl.textContent = state.pendingApproval.newTasks.length;
    if (completeCountEl) completeCountEl.textContent = state.pendingApproval.completedTaskIds.length;

    if (addGroup && addListEl) {
      if (state.pendingApproval.newTasks.length === 0) {
        addGroup.style.display = 'none';
      } else {
        addGroup.style.display = 'block';
        addListEl.innerHTML = state.pendingApproval.newTasks.map(t => `
          <div class="approval-item to-add" data-temp-id="${t.tempId}">
            <input 
              type="text" 
              class="approval-item-input" 
              value="${escapeHtml(t.title)}" 
              placeholder="Task title"
              onchange="updatePendingTaskTitle('${t.tempId}', this.value)"
            >
            <input 
              type="text" 
              class="approval-item-time-input" 
              value="${escapeHtml(t.time || '')}" 
              placeholder="Time"
              onchange="updatePendingTaskTime('${t.tempId}', this.value)"
            >
            <button class="btn-task-action delete" onclick="removePendingTask('${t.tempId}')" title="Remove">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>`).join('');
      }
    }

    if (completeGroup && completeListEl) {
      if (state.pendingApproval.completedTaskIds.length === 0) {
        completeGroup.style.display = 'none';
      } else {
        completeGroup.style.display = 'block';
        completeListEl.innerHTML = state.pendingApproval.completedTaskIds.map(id => {
          const task = state.tasks.find(t => t.id === id);
          const title = task ? task.title : 'Task ' + id;
          return `
            <div class="approval-item to-complete" data-id="${id}">
              <span style="text-decoration: line-through; color: var(--text-secondary); font-size: 0.95rem;">
                ✓ ${escapeHtml(title)}
              </span>
              <button class="btn-task-action delete" onclick="removePendingCompleted('${id}')" title="Don't mark this complete">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>`;
        }).join('');
      }
    }
  } catch (renderErr) {
    console.error('Error rendering approval modal content:', renderErr);
  }

  modal.classList.add('open');
}

// Global functions for inline approval modal editing
window.updatePendingTaskTitle = (tempId, newTitle) => {
  if (!state.pendingApproval) return;
  const item = state.pendingApproval.newTasks.find(t => t.tempId === tempId);
  if (item) item.title = newTitle;
};

window.updatePendingTaskTime = (tempId, newTime) => {
  if (!state.pendingApproval) return;
  const item = state.pendingApproval.newTasks.find(t => t.tempId === tempId);
  if (item) item.time = newTime;
};

window.removePendingTask = (tempId) => {
  if (!state.pendingApproval) return;
  state.pendingApproval.newTasks = state.pendingApproval.newTasks.filter(t => t.tempId !== tempId);
  const el = document.querySelector(`.approval-item[data-temp-id="${tempId}"]`);
  if (el) el.remove();
  document.getElementById('approval-add-count').textContent = state.pendingApproval.newTasks.length;
};

window.removePendingCompleted = (id) => {
  if (!state.pendingApproval) return;
  state.pendingApproval.completedTaskIds = state.pendingApproval.completedTaskIds.filter(cid => cid !== id);
  const el = document.querySelector(`.approval-item[data-id="${id}"]`);
  if (el) el.remove();
  document.getElementById('approval-complete-count').textContent = state.pendingApproval.completedTaskIds.length;
};

function closeApprovalModal() {
  const modal = document.getElementById('modal-approval');
  if (modal) modal.classList.remove('open');
  state.pendingApproval = null;
}

function applyPendingApproval() {
  if (!state.pendingApproval) return;

  const todayStr = getTodayDateString();
  let addedCount = 0;
  let completedCount = 0;

  // 1. Mark completed tasks
  state.pendingApproval.completedTaskIds.forEach(id => {
    const task = state.tasks.find(t => t.id === id);
    if (task && !task.completed) {
      task.completed = true;
      task.completedAt = new Date().toISOString();
      completedCount++;
    }
  });

  // 2. Add new tasks
  state.pendingApproval.newTasks.forEach(item => {
    if (item.title && item.title.trim()) {
      state.tasks.unshift({
        id: generateId(),
        title: item.title.trim(),
        time: item.time || '',
        date: todayStr,
        category: item.category || 'General',
        priority: item.priority || 'medium',
        completed: false,
        completedAt: null,
        createdAt: new Date().toISOString()
      });
      addedCount++;
    }
  });

  saveTasksToStorage();
  renderTasks();
  sounds.playSuccessChime();

  // Clear speech input box
  const transcriptInput = document.getElementById('transcript-input');
  if (transcriptInput) transcriptInput.value = '';

  closeApprovalModal();
  showToast(`⚡ AI Applied: +${addedCount} new tasks, ${completedCount} marked completed!`, 'success');
}

// ============================================================================
// Manual Task Modal (Top Right Corner)
// ============================================================================
function openManualModal() {
  const modal = document.getElementById('modal-manual-task');
  const form = document.getElementById('form-manual-task');
  const dateInput = document.getElementById('manual-task-date');
  if (dateInput) dateInput.value = getTodayDateString();
  if (form) form.reset();
  if (modal) modal.classList.add('open');
}

function closeManualModal() {
  const modal = document.getElementById('modal-manual-task');
  if (modal) modal.classList.remove('open');
}

function handleManualTaskSubmit(e) {
  e.preventDefault();
  const title = document.getElementById('manual-task-title').value.trim();
  const time = document.getElementById('manual-task-time').value;
  const date = document.getElementById('manual-task-date').value || getTodayDateString();
  const category = document.getElementById('manual-task-category').value;
  const priority = document.getElementById('manual-task-priority').value;

  if (!title) return;

  // Format time to 12-hour format if entered
  let formattedTime = time;
  if (time && time.includes(':')) {
    const [h, m] = time.split(':');
    const d = new Date();
    d.setHours(h, m);
    formattedTime = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const newTask = {
    id: generateId(),
    title,
    time: formattedTime,
    date,
    category,
    priority,
    completed: false,
    completedAt: null,
    createdAt: new Date().toISOString()
  };

  state.tasks.unshift(newTask);
  saveTasksToStorage();
  renderTasks();
  closeManualModal();
  showToast(`Added manual task: "${title}"`, 'success');
}

// ============================================================================
// Page 2: History & Analytics
// ============================================================================
function renderHistoryView() {
  const container = document.getElementById('history-timeline-container');
  const statTotal = document.getElementById('stat-total-tasks');
  const statCompleted = document.getElementById('stat-completed-tasks');
  const statRate = document.getElementById('stat-completion-rate');

  if (!container || !statTotal) return;

  const total = state.tasks.length;
  const completed = state.tasks.filter(t => t.completed).length;
  const rate = total > 0 ? Math.round((completed / total) * 100) : 0;

  statTotal.textContent = total;
  statCompleted.textContent = completed;
  statRate.textContent = rate + '%';

  // Group tasks by date
  const grouped = {};
  state.tasks.forEach(task => {
    const d = task.date || 'Unscheduled';
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(task);
  });

  // Sort dates descending
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  // Filter if user picked a specific date
  const datesToDisplay = state.filterHistoryDate
    ? sortedDates.filter(d => d === state.filterHistoryDate)
    : sortedDates;

  if (datesToDisplay.length === 0) {
    container.innerHTML = `
      <div class="tasks-empty-state">
        <h4 style="color: var(--text-primary); margin-bottom: 0.35rem;">No tasks found for this date.</h4>
        <p style="font-size: 0.85rem;">Try choosing another date or tap "Show All Days".</p>
      </div>`;
    return;
  }

  container.innerHTML = datesToDisplay.map(dateKey => {
    const dayTasks = grouped[dateKey] || [];
    const dayDone = dayTasks.filter(t => t.completed).length;
    const dayTotal = dayTasks.length;
    const dayPercent = Math.round((dayDone / dayTotal) * 100);

    return `
      <div class="history-timeline-group">
        <div class="timeline-date-header">
          <span>${formatDisplayDate(dateKey)}</span>
          <span class="timeline-badge">${dayDone} / ${dayTotal} Completed (${dayPercent}%)</span>
        </div>
        <div class="history-day-list">
          ${dayTasks.map(task => renderTaskCard(task)).join('')}
        </div>
      </div>`;
  }).join('');

  attachTaskEventListeners();
}

function exportTasksBackup() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.tasks, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `steroid_todo_backup_${getTodayDateString()}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  showToast('Task backup exported successfully!', 'success');
}

// ============================================================================
// Page 3: Settings & Gemini Diagnostics
// ============================================================================
function updateApiStatusIndicator() {
  const statusPill = document.getElementById('api-status-pill');
  const statusText = document.getElementById('api-status-text');
  if (!statusPill || !statusText) return;

  if (state.apiKey && state.apiKey.trim().length > 10) {
    statusPill.classList.remove('missing');
    statusText.textContent = 'AI Ready';
  } else {
    statusPill.classList.add('missing');
    statusText.textContent = 'Add API Key';
  }
}

function normalizeModelName(name) {
  if (!name) return 'gemini-2.5-flash';
  return name.replace(/^models\//, '').trim();
}

function extractSuggestedModel(errMsg) {
  if (!errMsg) return null;
  // Matches "use models/gemini-3.8-flash" or similar from Google error messages
  const match = errMsg.match(/use models\/([a-zA-Z0-9._-]+)/i);
  if (match && match[1]) {
    return normalizeModelName(match[1]);
  }
  if (errMsg.includes('is no longer available') || errMsg.includes('not found')) {
    return 'gemini-2.5-flash';
  }
  return null;
}

function updateModelUI() {
  const modelSelect = document.getElementById('setting-model');
  const customGroup = document.getElementById('custom-model-group');
  const customInput = document.getElementById('setting-custom-model');

  if (!modelSelect) return;

  const current = normalizeModelName(state.model);
  let matched = false;

  for (let i = 0; i < modelSelect.options.length; i++) {
    if (modelSelect.options[i].value === current) {
      modelSelect.value = current;
      matched = true;
      break;
    }
  }

  if (!matched) {
    modelSelect.value = 'custom';
    if (customGroup) customGroup.style.display = 'block';
    if (customInput) customInput.value = current;
  } else {
    if (customGroup) customGroup.style.display = 'none';
  }
}

async function fetchAvailableModels(apiKey) {
  const key = apiKey || state.apiKey || document.getElementById('setting-api-key')?.value.trim();
  if (!key) {
    showToast('Enter your Google AI Studio API key first to auto-detect models', 'error');
    return;
  }

  const btn = document.getElementById('btn-fetch-models');
  const oldText = btn ? btn.textContent : '';
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Detecting...';
  }

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${res.status}`);
    }

    const data = await res.json();
    const modelsList = data.models || [];
    const contentModels = modelsList.filter(m => m.supportedGenerationMethods?.includes('generateContent'));

    if (contentModels.length === 0) {
      showToast('No models found for this key.', 'info');
      return;
    }

    const selectEl = document.getElementById('setting-model');
    if (selectEl) {
      // Remember what the user currently has selected before rebuilding the list
      const previouslySelected = state.model;

      selectEl.innerHTML = '';

      contentModels.forEach(m => {
        const clean = normalizeModelName(m.name);
        const opt = document.createElement('option');
        opt.value = clean;
        const displayName = m.displayName || clean;
        opt.textContent = `${clean} (${displayName})`;
        selectEl.appendChild(opt);
      });

      const customOpt = document.createElement('option');
      customOpt.value = 'custom';
      customOpt.textContent = '✏️ Custom Model ID (Enter manually)...';
      selectEl.appendChild(customOpt);

      // IMPORTANT: Restore the user's previously selected model — never override it automatically.
      // state.model is intentionally NOT changed here.
      updateModelUI();

      showToast(`✓ Found ${contentModels.length} models. Your selected model (${previouslySelected}) is unchanged.`, 'success');
    }
  } catch (err) {
    console.error('Fetch Models Error:', err);
    showToast(`Could not fetch models: ${err.message}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = oldText || '🔄 Auto-Detect Models';
    }
  }
}

async function testApiKeyConnection() {
  const input = document.getElementById('setting-api-key');
  const key = input ? input.value.trim() : '';

  if (!key) {
    showToast('Please paste a Google AI Studio API key first', 'error');
    return;
  }

  const btn = document.getElementById('btn-test-api');
  btn.disabled = true;
  btn.textContent = 'Testing...';

  // Probe models in order until one responds — only to verify the KEY is valid.
  // We do NOT change state.model here; the user's selected model is preserved.
  const probeModels = [
    normalizeModelName(state.model),
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash'
  ];
  const uniqueProbes = [...new Set(probeModels)];

  async function pingModel(modelName) {
    const clean = normalizeModelName(modelName);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${clean}:generateContent?key=${encodeURIComponent(key)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Respond with OK' }] }]
      })
    });
    return { ok: response.ok, status: response.status, data: await response.json().catch(() => ({})) };
  }

  try {
    let keyValid = false;
    let lastErrMsg = '';

    for (const probe of uniqueProbes) {
      const result = await pingModel(probe);
      if (result.ok) {
        keyValid = true;
        break;
      }
      const errMsg = result.data.error?.message || `HTTP ${result.status}`;
      // If the error is specifically about the KEY (not the model), fail immediately
      if (
        errMsg.toLowerCase().includes('api key not valid') ||
        result.data.error?.status === 'INVALID_ARGUMENT' ||
        result.status === 400
      ) {
        throw new Error(`API Key Error: ${errMsg}`);
      }
      lastErrMsg = errMsg;
    }

    if (!keyValid) {
      throw new Error(lastErrMsg || 'Key could not be verified with any available model.');
    }

    // Key is valid — save it without touching state.model
    state.apiKey = key;
    localStorage.setItem(STORAGE_KEYS.API_KEY, key);
    updateApiStatusIndicator();
    sounds.playSuccessChime();
    showToast(`✓ API Key verified! Fetching available models...`, 'success');

    // Refresh the model dropdown list in background (does NOT change selected model)
    await fetchAvailableModels(key);

  } catch (err) {
    console.error('API Test Error:', err);
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Test Key';
  }
}

// ============================================================================
// PWA Installation Hook (Desktop & Mobile Chrome App Install)
// ============================================================================
function setupPWA() {
  // Register Service Worker
  if ('serviceWorker' in navigator) {
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isDev) {
      // Unregister any active service worker in local dev to prevent stale cache/CSS interception
      navigator.serviceWorker.getRegistrations().then(regs => {
        for (const reg of regs) {
          reg.unregister();
        }
      });
      // Clear all caches in dev to ensure fresh CSS
      if ('caches' in window) {
        caches.keys().then(names => {
          for (const name of names) {
            caches.delete(name);
          }
        });
      }
    } else {
      navigator.serviceWorker.register('./sw.js')
        .then(() => console.log('PWA Service Worker registered'))
        .catch(err => console.warn('SW registration failed:', err));
    }
  }

  const installBtn = document.getElementById('btn-pwa-install');

  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    state.deferredPWAInstallPrompt = e;
    if (installBtn) {
      installBtn.classList.add('visible');
    }
  });

  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!state.deferredPWAInstallPrompt) {
        showToast('To install: click the Install icon in your Chrome URL bar!', 'info');
        return;
      }
      state.deferredPWAInstallPrompt.prompt();
      const { outcome } = await state.deferredPWAInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        showToast('App installed to your device! Look for it with your app icons.', 'success');
        installBtn.classList.remove('visible');
      }
      state.deferredPWAInstallPrompt = null;
    });
  }

  window.addEventListener('appinstalled', () => {
    showToast('To-Do on Steroids was installed successfully!', 'success');
    if (installBtn) installBtn.classList.remove('visible');
  });
}

// ============================================================================
// Navigation Tabs
// ============================================================================
function switchTab(targetPageId) {
  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    const isTarget = btn.getAttribute('data-target') === targetPageId;
    btn.classList.toggle('active', isTarget);
    btn.setAttribute('aria-selected', isTarget ? 'true' : 'false');
  });

  document.querySelectorAll('.page-view').forEach(page => {
    page.classList.toggle('active', page.id === targetPageId);
  });

  if (targetPageId === 'page-history') {
    renderHistoryView();
  } else if (targetPageId === 'page-today') {
    renderTasks();
  }
}

// ============================================================================
// Initialization & Event Listeners
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  loadStateFromStorage();

  // Display Current Date in Header
  const dateTextEl = document.getElementById('current-date-text');
  if (dateTextEl) {
    dateTextEl.textContent = new Date().toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric'
    });
  }

  // Navigation tab clicks
  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-target');
      switchTab(target);
    });
  });

  // Header API Status Pill click
  const statusPill = document.getElementById('api-status-pill');
  if (statusPill) {
    statusPill.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab('page-settings');
    });
  }

  // Mic Button Click
  const micBtn = document.getElementById('btn-mic');
  if (micBtn) {
    micBtn.addEventListener('click', () => {
      toggleRecording();
    });
  }

  // Clear Transcript
  const clearTranscriptBtn = document.getElementById('btn-clear-transcript');
  if (clearTranscriptBtn) {
    clearTranscriptBtn.addEventListener('click', () => {
      const input = document.getElementById('transcript-input');
      if (input) input.value = '';
    });
  }

  // Quick Prompt Chips
  document.querySelectorAll('.prompt-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const text = chip.getAttribute('data-text');
      const input = document.getElementById('transcript-input');
      if (input) {
        input.value = text;
        showToast('Prompt loaded! Click "Analyze with Gemini AI" to test.');
      }
    });
  });

  // AI Status Banner Dismiss
  const dismissAiBannerBtn = document.getElementById('btn-dismiss-ai-status');
  if (dismissAiBannerBtn) {
    dismissAiBannerBtn.addEventListener('click', () => {
      setAiBanner(null);
    });
  }

  // Analyze with AI Button
  const analyzeBtn = document.getElementById('btn-ai-analyze');
  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', () => {
      if (state.isRecording) stopRecording();
      analyzeWithGemini();
    });
  }

  // Toggle Completed Tasks Collapsible
  const toggleCompletedBtn = document.getElementById('btn-toggle-completed');
  const completedList = document.getElementById('completed-tasks-list');
  if (toggleCompletedBtn && completedList) {
    toggleCompletedBtn.addEventListener('click', () => {
      state.completedCollapsed = !state.completedCollapsed;
      toggleCompletedBtn.classList.toggle('collapsed', state.completedCollapsed);
      completedList.style.display = state.completedCollapsed ? 'none' : 'block';
    });
  }

  // Approval Modal Actions
  const closeApprovalBtn = document.getElementById('btn-close-approval-modal');
  const rejectApprovalBtn = document.getElementById('btn-reject-approval');
  const confirmApprovalBtn = document.getElementById('btn-confirm-approval');

  if (closeApprovalBtn) closeApprovalBtn.addEventListener('click', closeApprovalModal);
  if (rejectApprovalBtn) rejectApprovalBtn.addEventListener('click', closeApprovalModal);
  if (confirmApprovalBtn) confirmApprovalBtn.addEventListener('click', applyPendingApproval);

  // Manual Task Modal Actions
  const openManualBtn = document.getElementById('btn-open-manual-modal');
  const closeManualBtn = document.getElementById('btn-close-manual-modal');
  const cancelManualBtn = document.getElementById('btn-cancel-manual');
  const manualForm = document.getElementById('form-manual-task');

  if (openManualBtn) openManualBtn.addEventListener('click', openManualModal);
  if (closeManualBtn) closeManualBtn.addEventListener('click', closeManualModal);
  if (cancelManualBtn) cancelManualBtn.addEventListener('click', closeManualModal);
  if (manualForm) manualForm.addEventListener('submit', handleManualTaskSubmit);

  // History Filter Controls
  const historyDateFilter = document.getElementById('history-date-filter');
  const historyShowAllBtn = document.getElementById('btn-history-show-all');
  const exportHistoryBtn = document.getElementById('btn-export-history');

  if (historyDateFilter) {
    historyDateFilter.addEventListener('change', (e) => {
      state.filterHistoryDate = e.target.value;
      renderHistoryView();
    });
  }

  if (historyShowAllBtn) {
    historyShowAllBtn.addEventListener('click', () => {
      state.filterHistoryDate = null;
      if (historyDateFilter) historyDateFilter.value = '';
      renderHistoryView();
    });
  }

  if (exportHistoryBtn) {
    exportHistoryBtn.addEventListener('click', exportTasksBackup);
  }

  // Settings Controls
  const apiKeyInput = document.getElementById('setting-api-key');
  const toggleKeyVisibilityBtn = document.getElementById('btn-toggle-key-visibility');
  const testApiBtn = document.getElementById('btn-test-api');
  const modelSelect = document.getElementById('setting-model');
  const speechLangSelect = document.getElementById('setting-speech-lang');
  const soundEffectsCheck = document.getElementById('setting-sound-effects');
  const clearAllDataBtn = document.getElementById('btn-clear-all-data');

  if (apiKeyInput) {
    apiKeyInput.value = state.apiKey;
    apiKeyInput.addEventListener('change', (e) => {
      state.apiKey = e.target.value.trim();
      localStorage.setItem(STORAGE_KEYS.API_KEY, state.apiKey);
      updateApiStatusIndicator();
    });
  }

  if (toggleKeyVisibilityBtn && apiKeyInput) {
    toggleKeyVisibilityBtn.addEventListener('click', () => {
      const isPassword = apiKeyInput.type === 'password';
      apiKeyInput.type = isPassword ? 'text' : 'password';
      toggleKeyVisibilityBtn.textContent = isPassword ? 'Hide' : 'Show';
    });
  }

  if (testApiBtn) testApiBtn.addEventListener('click', testApiKeyConnection);

  const fetchModelsBtn = document.getElementById('btn-fetch-models');
  if (fetchModelsBtn) {
    fetchModelsBtn.addEventListener('click', () => fetchAvailableModels());
  }

  const customModelInput = document.getElementById('setting-custom-model');
  const customModelGroup = document.getElementById('custom-model-group');

  if (modelSelect) {
    updateModelUI();

    modelSelect.addEventListener('change', (e) => {
      const selectedVal = e.target.value;
      if (selectedVal === 'custom') {
        if (customModelGroup) customModelGroup.style.display = 'block';
        if (customModelInput) {
          customModelInput.focus();
          if (customModelInput.value.trim()) {
            state.model = normalizeModelName(customModelInput.value.trim());
          }
        }
      } else {
        if (customModelGroup) customModelGroup.style.display = 'none';
        state.model = normalizeModelName(selectedVal);
      }
      localStorage.setItem(STORAGE_KEYS.MODEL, state.model);
      showToast(`Selected Model: ${state.model}`);
    });
  }

  if (customModelInput) {
    customModelInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      if (val) {
        state.model = normalizeModelName(val);
        localStorage.setItem(STORAGE_KEYS.MODEL, state.model);
      }
    });
  }

  if (speechLangSelect) {
    speechLangSelect.value = state.language;
    speechLangSelect.addEventListener('change', (e) => {
      state.language = e.target.value;
      localStorage.setItem(STORAGE_KEYS.LANGUAGE, state.language);
      if (state.recognition) state.recognition.lang = state.language;
      showToast(`Voice Language updated to: ${state.language}`);
    });
  }

  if (soundEffectsCheck) {
    soundEffectsCheck.checked = state.soundFxEnabled;
    soundEffectsCheck.addEventListener('change', (e) => {
      state.soundFxEnabled = e.target.checked;
      localStorage.setItem(STORAGE_KEYS.SOUND_FX, state.soundFxEnabled);
    });
  }

  if (clearAllDataBtn) {
    clearAllDataBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to reset all tasks? Your settings and API key will remain safe.')) {
        state.tasks = [];
        saveTasksToStorage();
        renderTasks();
        showToast('All tasks cleared from cache.');
      }
    });
  }

  // Setup initial render & integrations
  renderTasks();
  updateApiStatusIndicator();
  setupSpeechRecognition();
  setupPWA();
});
