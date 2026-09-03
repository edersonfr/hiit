/**
 * HIIT NA ESTEIRA - APLICATIVO DE INTERVALOS
 * Web App PWA com Web Audio, Web Speech e Wake Lock API
 */

// Global State
const state = {
  activePreset: 'iniciante', // 'iniciante', 'intermediario', 'avancado', 'custom'
  soundEnabled: true,
  voiceEnabled: true,
  quickTestMode: false,
  isRunning: false,
  isPaused: false,
  stages: [],
  currentStageIndex: 0,
  stageSecondsRemaining: 0,
  stageTotalSeconds: 0,
  totalElapsedSeconds: 0,
  timerInterval: null,
  wakeLock: null,
  workoutHistory: JSON.parse(localStorage.getItem('hiit_history') || '[]')
};

// Web Audio Context for Beeps
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      audioCtx = new AudioContext();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// Sound Synthesis Helper
function playTone(freq, type, duration, volume = 0.15) {
  if (!state.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    console.error('Audio error:', e);
  }
}

function playBeep321() {
  playTone(880, 'sine', 0.15, 0.2); // A5 high beep
}

function playStageSwitchBeep() {
  playTone(1200, 'triangle', 0.2, 0.3);
  setTimeout(() => playTone(1600, 'triangle', 0.3, 0.3), 150);
}

function playFanfare() {
  if (!state.soundEnabled) return;
  const notes = [523.25, 659.25, 783.99, 1046.50];
  notes.forEach((freq, idx) => {
    setTimeout(() => playTone(freq, 'sine', 0.3, 0.3), idx * 180);
  });
}

// Web Speech Synthesis (Voz em Português)
function speakPrompt(text) {
  if (!state.voiceEnabled || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel(); // Cancel any lingering speech
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = 1.05; // Slightly faster for workout motivation
    utterance.pitch = 1.0;
    
    // Attempt to pick a smooth pt-BR voice if available
    const voices = window.speechSynthesis.getVoices();
    const ptVoice = voices.find(v => v.lang.startsWith('pt'));
    if (ptVoice) {
      utterance.voice = ptVoice;
    }
    
    window.speechSynthesis.speak(utterance);
  } catch (e) {
    console.error('Speech error:', e);
  }
}

// Wake Lock API
async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      state.wakeLock = await navigator.wakeLock.request('screen');
    } catch (err) {
      console.warn('Wake Lock request failed:', err);
    }
  }
}

function releaseWakeLock() {
  if (state.wakeLock) {
    state.wakeLock.release().then(() => {
      state.wakeLock = null;
    });
  }
}

// Vibration API
function vibratePattern(pattern) {
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch (e) {}
  }
}

// Format seconds into MM:SS
function formatTime(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Build Workout Stages based on Preset
function generateStages() {
  const isQuick = state.quickTestMode;
  const scale = isQuick ? 0.1 : 1.0; // 10x faster in quick test mode

  const stages = [];
  const preset = state.activePreset;

  if (preset === 'iniciante') {
    const reps = parseInt(document.getElementById('repsIniciante').value, 10) || 10;
    const warmupTime = Math.max(2, Math.round(300 * scale)); // 5 min
    const highTime = Math.max(2, Math.round(30 * scale));     // 30s
    const lowTime = Math.max(2, Math.round(60 * scale));      // 60s
    const coolTime = Math.max(2, Math.round(300 * scale));    // 5 min

    stages.push({ type: 'warmup', title: 'AQUECIMENTO', sub: 'Caminhada leve a moderada na esteira', pace: 'CAMINHADA', duration: warmupTime, icon: '🟢', color: '#10b981', glow: 'rgba(16, 185, 129, 0.35)', tip: 'Comece com velocidade confortável e inclinação plana (0-2%).' });

    for (let i = 1; i <= reps; i++) {
      stages.push({ type: 'high', title: 'TIRO - ALTA INTENSIDADE', sub: 'Corrida rápida / esforço intenso', pace: 'CORRIDA FORTE', duration: highTime, rep: i, totalReps: reps, icon: '🔴', color: '#ef4444', glow: 'rgba(239, 68, 68, 0.4)', tip: 'Fique ofegante! Dificuldade de conversar durante o tiro.' });
      stages.push({ type: 'low', title: 'DESCANSO - CAMINHADA', sub: 'Caminhada leve para recuperar o fôlego', pace: 'CAMINHADA LEVE', duration: lowTime, rep: i, totalReps: reps, icon: '🟡', color: '#f59e0b', glow: 'rgba(245, 158, 11, 0.35)', tip: 'Respire fundo e recupere os batimentos cardíacos.' });
    }

    stages.push({ type: 'cooldown', title: 'DESACELERAÇÃO', sub: 'Caminhada leve final', pace: 'CAMINHADA LEVE', duration: coolTime, icon: '🔵', color: '#06b6d4', glow: 'rgba(6, 182, 212, 0.35)', tip: 'Diminua o ritmo aos poucos até a frequência cardíaca voltar ao normal.' });

  } else if (preset === 'intermediario') {
    const restSec = parseInt(document.getElementById('restIntermediario').value, 10) || 45;
    const reps = parseInt(document.getElementById('repsIntermediario').value, 10) || 10;
    const warmupTime = Math.max(2, Math.round(300 * scale));
    const highTime = Math.max(2, Math.round(30 * scale));
    const lowTime = Math.max(2, Math.round(restSec * scale));
    const coolTime = Math.max(2, Math.round(300 * scale));

    stages.push({ type: 'warmup', title: 'AQUECIMENTO', sub: 'Caminhada leve a moderada na esteira', pace: 'CAMINHADA', duration: warmupTime, icon: '🟢', color: '#10b981', glow: 'rgba(16, 185, 129, 0.35)', tip: 'Prepare seus músculos para a corrida forte.' });

    for (let i = 1; i <= reps; i++) {
      stages.push({ type: 'high', title: 'TIRO - ALTA INTENSIDADE', sub: 'Corrida forte', pace: 'CORRIDA FORTE', duration: highTime, rep: i, totalReps: reps, icon: '🔴', color: '#ef4444', glow: 'rgba(239, 68, 68, 0.4)', tip: 'Postura ereta e abdômen contraído!' });
      stages.push({ type: 'low', title: 'DESCANSO - CAMINHADA', sub: 'Caminhada de recuperação', pace: 'CAMINHADA LEVE', duration: lowTime, rep: i, totalReps: reps, icon: '🟡', color: '#f59e0b', glow: 'rgba(245, 158, 11, 0.35)', tip: 'Diminua a velocidade da esteira para recuperar.' });
    }

    stages.push({ type: 'cooldown', title: 'DESACELERAÇÃO', sub: 'Caminhada leve final', pace: 'CAMINHADA LEVE', duration: coolTime, icon: '🔵', color: '#06b6d4', glow: 'rgba(6, 182, 212, 0.35)', tip: 'Ótimo trabalho! Desacelere suavemente.' });

  } else if (preset === 'avancado') {
    const reps = parseInt(document.getElementById('repsAvancado').value, 10) || 12;
    const warmupTime = Math.max(2, Math.round(300 * scale));
    const highTime = Math.max(2, Math.round(40 * scale));
    const lowTime = Math.max(2, Math.round(20 * scale));
    const coolTime = Math.max(2, Math.round(300 * scale));

    stages.push({ type: 'warmup', title: 'AQUECIMENTO', sub: 'Caminhada leve a moderada', pace: 'CAMINHADA', duration: warmupTime, icon: '🟢', color: '#10b981', glow: 'rgba(16, 185, 129, 0.35)', tip: 'Foco e aquecimento completo para treino avançado.' });

    for (let i = 1; i <= reps; i++) {
      stages.push({ type: 'high', title: 'TIRO INTENSO (40s)', sub: 'Corrida em velocidade máxima', pace: 'VELOCIDADE MÁXIMA', duration: highTime, rep: i, totalReps: reps, icon: '🔴', color: '#ef4444', glow: 'rgba(239, 68, 68, 0.4)', tip: 'Máxima explosão! Mantenha o foco até o bip.' });
      stages.push({ type: 'low', title: 'DESCANSO RÁPIDO (20s)', sub: 'Caminhada curta de transição', pace: 'CAMINHADA', duration: lowTime, rep: i, totalReps: reps, icon: '🟡', color: '#f59e0b', glow: 'rgba(245, 158, 11, 0.35)', tip: 'Descanso curto! Fique pronto para o próximo tiro.' });
    }

    stages.push({ type: 'cooldown', title: 'DESACELERAÇÃO', sub: 'Caminhada leve final (5 min)', pace: 'CAMINHADA LEVE', duration: coolTime, icon: '🔵', color: '#06b6d4', glow: 'rgba(6, 182, 212, 0.35)', tip: 'Desaceleração essencial para baixar os batimentos com segurança.' });

  } else if (preset === 'custom') {
    const warmupMin = parseInt(document.getElementById('customWarmup').value, 10) || 5;
    const highSec = parseInt(document.getElementById('customHigh').value, 10) || 30;
    const lowSec = parseInt(document.getElementById('customLow').value, 10) || 45;
    const reps = parseInt(document.getElementById('customReps').value, 10) || 10;

    const warmupTime = Math.max(2, Math.round((warmupMin * 60) * scale));
    const highTime = Math.max(2, Math.round(highSec * scale));
    const lowTime = Math.max(2, Math.round(lowSec * scale));
    const coolTime = Math.max(2, Math.round(300 * scale));

    stages.push({ type: 'warmup', title: 'AQUECIMENTO', sub: 'Caminhada leve a moderada', pace: 'CAMINHADA', duration: warmupTime, icon: '🟢', color: '#10b981', glow: 'rgba(16, 185, 129, 0.35)', tip: 'Aquecimento personalizado.' });

    for (let i = 1; i <= reps; i++) {
      stages.push({ type: 'high', title: 'TIRO - INTENSIDADE', sub: 'Corrida alta intensidade', pace: 'CORRIDA', duration: highTime, rep: i, totalReps: reps, icon: '🔴', color: '#ef4444', glow: 'rgba(239, 68, 68, 0.4)', tip: 'Dê o seu melhor durante o tiro!' });
      stages.push({ type: 'low', title: 'DESCANSO', sub: 'Caminhada de recuperação', pace: 'CAMINHADA', duration: lowTime, rep: i, totalReps: reps, icon: '🟡', color: '#f59e0b', glow: 'rgba(245, 158, 11, 0.35)', tip: 'Recupere o fôlego.' });
    }

    stages.push({ type: 'cooldown', title: 'DESACELERAÇÃO', sub: 'Caminhada leve final', pace: 'CAMINHADA LEVE', duration: coolTime, icon: '🔵', color: '#06b6d4', glow: 'rgba(6, 182, 212, 0.35)', tip: 'Finalize reduzindo a caminhada.' });
  }

  return stages;
}

// UI Navigation / Screen Switcher
function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(screenId);
  if (target) target.classList.add('active');

  // Update tabs if Home/Select screen
  if (screenId === 'screenSelect') {
    document.getElementById('tabHome').classList.add('active');
    document.getElementById('tabTips').classList.remove('active');
    document.getElementById('tabHistory').classList.remove('active');
  }
}

// Update Active Workout UI for Current Stage
function updateStageUI() {
  const stage = state.stages[state.currentStageIndex];
  if (!stage) return;

  // Banner & Phase info
  document.getElementById('phaseIcon').textContent = stage.icon;
  document.getElementById('phaseTitle').textContent = stage.title;
  document.getElementById('phaseSubtext').textContent = stage.sub;
  
  // Theme Color updates
  document.documentElement.style.setProperty('--current-phase-color', stage.color);
  document.documentElement.style.setProperty('--current-phase-glow', stage.glow);

  // Round Pill
  if (stage.rep && stage.totalReps) {
    document.getElementById('roundPill').textContent = `SÉRIE ${stage.rep}/${stage.totalReps}`;
    document.getElementById('roundPill').style.display = 'block';
  } else {
    document.getElementById('roundPill').style.display = 'none';
  }

  // Next Phase Indicator
  const nextStage = state.stages[state.currentStageIndex + 1];
  if (nextStage) {
    if (nextStage.type === 'high') {
      document.getElementById('displayNextPhase').textContent = '🔴 TIRO';
    } else if (nextStage.type === 'low') {
      document.getElementById('displayNextPhase').textContent = '🟡 CAMINHADA';
    } else if (nextStage.type === 'cooldown') {
      document.getElementById('displayNextPhase').textContent = '🔵 FIM/DESAC.';
    } else {
      document.getElementById('displayNextPhase').textContent = nextStage.pace;
    }
  } else {
    document.getElementById('displayNextPhase').textContent = 'FIM 🎉';
  }

  // Suggested Pace
  document.getElementById('displaySuggestedPace').textContent = stage.pace;
  
  // Tip Box Text
  document.getElementById('treadmillTipText').textContent = stage.tip;

  // Update Timer Numbers
  updateTimerDisplay();
}

function updateTimerDisplay() {
  const rem = state.stageSecondsRemaining;
  document.getElementById('displayIntervalTime').textContent = formatTime(rem);
  document.getElementById('displayTotalElapsed').textContent = formatTime(state.totalElapsedSeconds);

  // Update Progress Circle Ring (stroke-dashoffset from 0 to 754)
  const total = state.stageTotalSeconds;
  const circle = document.getElementById('progressCircle');
  if (total > 0) {
    const progressFraction = rem / total;
    const offset = 754 * (1 - progressFraction);
    circle.style.strokeDashoffset = offset;
  }
}

// Start Workout
function startWorkout() {
  getAudioContext(); // Initialize audio context on user gesture
  requestWakeLock();

  state.stages = generateStages();
  state.currentStageIndex = 0;
  state.totalElapsedSeconds = 0;
  state.isRunning = true;
  state.isPaused = false;

  loadStage(0);
  showScreen('screenActive');

  // Initial Voice Announcement
  const firstStage = state.stages[0];
  speakPrompt(`Iniciando treino HIIT. ${firstStage.title}. 5 minutos de caminhada.`);

  // Start Interval Loop
  if (state.timerInterval) clearInterval(state.timerInterval);
  state.timerInterval = setInterval(tickWorkout, 1000);
}

function loadStage(index) {
  state.currentStageIndex = index;
  const stage = state.stages[index];
  state.stageTotalSeconds = stage.duration;
  state.stageSecondsRemaining = stage.duration;
  updateStageUI();
}

// Main Timer Tick
function tickWorkout() {
  if (state.isPaused) return;

  state.totalElapsedSeconds++;
  state.stageSecondsRemaining--;

  const rem = state.stageSecondsRemaining;
  const stage = state.stages[state.currentStageIndex];

  // Beep Audio countdown at 3, 2, 1 seconds
  if (rem > 0 && rem <= 3) {
    playBeep321();
    vibratePattern(100);
  }

  // Voice Warning 5 seconds before Tiro (High Intensity)
  if (rem === 5) {
    const next = state.stages[state.currentStageIndex + 1];
    if (next && next.type === 'high') {
      speakPrompt("Atenção! Prepara para o tiro!");
    }
  }

  // Check Stage Finish
  if (rem <= 0) {
    // Advance to next stage
    if (state.currentStageIndex < state.stages.length - 1) {
      playStageSwitchBeep();
      vibratePattern([150, 50, 150]);
      
      const newIndex = state.currentStageIndex + 1;
      loadStage(newIndex);
      
      const newStage = state.stages[newIndex];
      // Voice cues on stage entry
      if (newStage.type === 'high') {
        speakPrompt(`Aumente a velocidade! Tiro ${newStage.rep} de ${newStage.totalReps}! Corrida!`);
      } else if (newStage.type === 'low') {
        speakPrompt("Reduza para caminhada leve. Descanse.");
      } else if (newStage.type === 'cooldown') {
        speakPrompt("Excelente! Iniciando desaceleração final. 5 minutos de caminhada leve.");
      }
    } else {
      // Workout Finished!
      finishWorkout();
    }
  } else {
    updateTimerDisplay();
  }
}

// Pause / Resume
function togglePauseResume() {
  state.isPaused = !state.isPaused;
  const btn = document.getElementById('btnPauseResume');
  const iconPause = document.getElementById('iconPause');
  const iconPlay = document.getElementById('iconPlay');
  const label = document.getElementById('labelPauseResume');

  if (state.isPaused) {
    btn.classList.remove('btn-pause');
    btn.classList.add('btn-resume');
    iconPause.style.display = 'none';
    iconPlay.style.display = 'inline';
    label.textContent = 'CONTINUAR';
    speakPrompt("Treino pausado");
  } else {
    btn.classList.remove('btn-resume');
    btn.classList.add('btn-pause');
    iconPause.style.display = 'inline';
    iconPlay.style.display = 'none';
    label.textContent = 'PAUSAR';
    speakPrompt("Treino retomado");
  }
}

// Skip Stage
function skipStage() {
  if (!state.isRunning) return;
  if (state.currentStageIndex < state.stages.length - 1) {
    loadStage(state.currentStageIndex + 1);
    playStageSwitchBeep();
  } else {
    finishWorkout();
  }
}

// Stop Workout
function stopWorkout() {
  if (confirm("Tem certeza que deseja encerrar o treino agora?")) {
    resetTimerState();
    showScreen('screenSelect');
  }
}

// Finish Workout
function finishWorkout() {
  resetTimerState();
  playFanfare();
  vibratePattern([200, 100, 200, 100, 400]);
  speakPrompt("Parabéns! Treino concluído com sucesso! Excelente trabalho!");

  // Compute stats
  const totalSecs = state.totalElapsedSeconds;
  const highStages = state.stages.filter(s => s.type === 'high');
  const totalReps = highStages.length;
  const presetNames = {
    'iniciante': 'Iniciante',
    'intermediario': 'Intermediário',
    'avancado': 'Avançado',
    'custom': 'Personalizado'
  };

  document.getElementById('summaryTime').textContent = formatTime(totalSecs);
  document.getElementById('summaryReps').textContent = `${totalReps}/${totalReps}`;
  document.getElementById('summaryPreset').textContent = presetNames[state.activePreset] || 'Iniciante';
  
  // Approx calories (HIIT on treadmill ~10-12 kcal/min)
  const estCalories = Math.round((totalSecs / 60) * 11);
  document.getElementById('summaryCalories').textContent = `~${estCalories} kcal`;

  // Save to History
  saveHistoryItem({
    date: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    preset: presetNames[state.activePreset] || 'Iniciante',
    durationSec: totalSecs,
    reps: totalReps,
    calories: estCalories
  });

  showScreen('screenSummary');
}

function resetTimerState() {
  state.isRunning = false;
  state.isPaused = false;
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
  releaseWakeLock();

  // Reset Pause Button UI
  const btn = document.getElementById('btnPauseResume');
  btn.classList.remove('btn-resume');
  btn.classList.add('btn-pause');
  document.getElementById('iconPause').style.display = 'inline';
  document.getElementById('iconPlay').style.display = 'none';
  document.getElementById('labelPauseResume').textContent = 'PAUSAR';
}

// LocalStorage History Management
function saveHistoryItem(item) {
  state.workoutHistory.unshift(item);
  if (state.workoutHistory.length > 20) state.workoutHistory.pop(); // Keep max 20
  localStorage.setItem('hiit_history', JSON.stringify(state.workoutHistory));
}

function renderHistory() {
  const container = document.getElementById('historyList');
  if (state.workoutHistory.length === 0) {
    container.innerHTML = `<div class="empty-history">Nenhum treino registrado ainda.<br>Complete seu primeiro HIIT na esteira!</div>`;
    return;
  }

  container.innerHTML = state.workoutHistory.map(item => `
    <div class="history-item">
      <div class="history-info">
        <span class="history-name">HIIT ${item.preset} (${item.reps} tiros)</span>
        <span class="history-date">${item.date}</span>
      </div>
      <div class="history-meta">
        ${formatTime(item.durationSec)}
      </div>
    </div>
  `).join('');
}

function clearHistory() {
  if (confirm("Deseja apagar todo o histórico de treinos?")) {
    state.workoutHistory = [];
    localStorage.removeItem('hiit_history');
    renderHistory();
  }
}

// Initialize Event Listeners & Preset Selectors
function initApp() {
  // Preset Selection Cards
  const cards = document.querySelectorAll('.preset-card');
  cards.forEach(card => {
    card.addEventListener('click', () => {
      cards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      state.activePreset = card.dataset.preset;
    });
  });

  // Audio Toggle
  document.getElementById('btnToggleAudio').addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    const btn = document.getElementById('btnToggleAudio');
    document.getElementById('iconAudioOn').style.display = state.soundEnabled ? 'inline' : 'none';
    document.getElementById('iconAudioOff').style.display = state.soundEnabled ? 'none' : 'inline';
    btn.classList.toggle('active', state.soundEnabled);
    if (state.soundEnabled) playBeep321();
  });

  // Voice Toggle
  document.getElementById('btnToggleVoice').addEventListener('click', () => {
    state.voiceEnabled = !state.voiceEnabled;
    const btn = document.getElementById('btnToggleVoice');
    document.getElementById('iconVoiceOn').style.display = state.voiceEnabled ? 'inline' : 'none';
    document.getElementById('iconVoiceOff').style.display = state.voiceEnabled ? 'none' : 'inline';
    btn.classList.toggle('active', state.voiceEnabled);
    if (state.voiceEnabled) speakPrompt("Voz ativada");
  });

  // Quick Test Mode Checkbox
  document.getElementById('chkQuickTest').addEventListener('change', (e) => {
    state.quickTestMode = e.target.checked;
  });

  // Start Workout Button
  document.getElementById('btnStartWorkout').addEventListener('click', startWorkout);
  document.getElementById('btnNewWorkout').addEventListener('click', () => showScreen('screenSelect'));

  // Timer Controls
  document.getElementById('btnPauseResume').addEventListener('click', togglePauseResume);
  document.getElementById('btnSkipStage').addEventListener('click', skipStage);
  document.getElementById('btnStopWorkout').addEventListener('click', stopWorkout);

  // 3-Dots Dropdown Menu Toggle
  const btnMenuDots = document.getElementById('btnMenuDots');
  const dropdownMenu = document.getElementById('dropdownMenu');
  
  if (btnMenuDots && dropdownMenu) {
    btnMenuDots.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdownMenu.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
      if (!dropdownMenu.contains(e.target) && e.target !== btnMenuDots) {
        dropdownMenu.classList.remove('active');
      }
    });
  }

  // Modals & Menu Navigation
  const modalTips = document.getElementById('modalTips');
  const modalHistory = document.getElementById('modalHistory');

  const menuItemHome = document.getElementById('menuItemHome');
  if (menuItemHome) {
    menuItemHome.addEventListener('click', () => {
      dropdownMenu.classList.remove('active');
      if (!state.isRunning) showScreen('screenSelect');
      else showScreen('screenActive');
    });
  }

  const menuItemTips = document.getElementById('menuItemTips');
  if (menuItemTips) {
    menuItemTips.addEventListener('click', () => {
      dropdownMenu.classList.remove('active');
      modalTips.classList.add('active');
    });
  }

  const menuItemHistory = document.getElementById('menuItemHistory');
  if (menuItemHistory) {
    menuItemHistory.addEventListener('click', () => {
      dropdownMenu.classList.remove('active');
      renderHistory();
      modalHistory.classList.add('active');
    });
  }

  document.getElementById('btnCloseTips').addEventListener('click', () => {
    modalTips.classList.remove('active');
  });

  document.getElementById('btnCloseHistory').addEventListener('click', () => {
    modalHistory.classList.remove('active');
  });

  document.getElementById('btnClearHistory').addEventListener('click', clearHistory);

  // Close Modals on Overlay Click
  [modalTips, modalHistory].forEach(m => {
    m.addEventListener('click', (e) => {
      if (e.target === m) m.classList.remove('active');
    });
  });

  // Register PWA Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.log('SW Registration failed:', err);
    });
  }
}

// Run on DOM Content Loaded
document.addEventListener('DOMContentLoaded', initApp);
