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

// LocalStorage History & Dedicated Screen
let lastWorkoutData = null; // Store last completed workout for quick sharing

function saveHistoryItem(item) {
  state.workoutHistory.unshift(item);
  if (state.workoutHistory.length > 50) state.workoutHistory.pop(); // Keep max 50
  localStorage.setItem('hiit_history', JSON.stringify(state.workoutHistory));
  lastWorkoutData = item;
}

function renderHistoryScreen() {
  const container = document.getElementById('historyCardsContainer');
  const history = state.workoutHistory;

  // Compute totals
  const totalCount = history.length;
  let totalCalories = 0;
  let totalSecs = 0;

  history.forEach(h => {
    totalCalories += (h.calories || 0);
    totalSecs += (h.durationSec || 0);
  });

  document.getElementById('totalWorkoutsCount').textContent = totalCount;
  document.getElementById('totalCaloriesCount').textContent = totalCalories > 0 ? `${totalCalories} kcal` : '0 kcal';
  document.getElementById('totalMinutesCount').textContent = `${Math.round(totalSecs / 60)} min`;

  if (history.length === 0) {
    container.innerHTML = `
      <div class="empty-history" style="padding: 40px 20px;">
        <div style="font-size: 2.5rem; margin-bottom: 8px;">🏃💨</div>
        <div style="font-weight: 700; font-size: 1rem; color: var(--text-main);">Nenhum treino registrado ainda.</div>
        <div style="font-size: 0.82rem; margin-top: 4px;">Escolha um nível e comece seu primeiro HIIT na esteira!</div>
      </div>
    `;
    return;
  }

  const badgeClasses = {
    'Iniciante': 'badge-iniciante',
    'Intermediário': 'badge-intermediario',
    'Avançado': 'badge-avancado',
    'Personalizado': 'badge-custom'
  };

  container.innerHTML = history.map((item, index) => `
    <div class="history-card-item">
      <div class="history-card-top">
        <span class="preset-badge ${badgeClasses[item.preset] || 'badge-iniciante'}">
          ${item.preset} (${item.reps} tiros)
        </span>
        <span class="history-card-date">${item.date}</span>
      </div>

      <div class="history-card-body">
        <div>
          <div class="card-stat-val">${formatTime(item.durationSec)}</div>
          <div class="card-stat-lbl">Tempo</div>
        </div>
        <div>
          <div class="card-stat-val">${item.reps}x</div>
          <div class="card-stat-lbl">Séries</div>
        </div>
        <div>
          <div class="card-stat-val" style="color: #10b981;">~${item.calories} kcal</div>
          <div class="card-stat-lbl">Calorias</div>
        </div>
      </div>

      <div class="history-card-footer">
        <button class="btn-share-mini" onclick="handleShareItemIndex(${index})">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>
          Compartilhar
        </button>
      </div>
    </div>
  `).join('');
}

function handleShareItemIndex(index) {
  const item = state.workoutHistory[index];
  if (item) {
    openShareModal(item);
  }
}

function clearHistory() {
  if (confirm("Deseja apagar todo o histórico de treinos?")) {
    state.workoutHistory = [];
    localStorage.removeItem('hiit_history');
    renderHistoryScreen();
  }
}

// SOCIAL MEDIA SHARE CANVAS & NATIVE SHARE
let currentShareWorkout = null;

function openShareModal(workout) {
  currentShareWorkout = workout || lastWorkoutData || {
    preset: 'Intermediário',
    durationSec: 1200,
    reps: 10,
    calories: 220,
    date: new Date().toLocaleDateString('pt-BR')
  };

  drawShareCanvas(currentShareWorkout);
  document.getElementById('modalShareCard').classList.add('active');
}

function drawShareCanvas(workout) {
  const canvas = document.getElementById('shareCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width; // 540
  const h = canvas.height; // 960

  // 1. Dark Gradient Background
  const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
  bgGrad.addColorStop(0, '#0f172a');
  bgGrad.addColorStop(0.5, '#1e1b4b');
  bgGrad.addColorStop(1, '#090d16');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // 2. Glowing Orbs
  ctx.save();
  ctx.shadowColor = '#ef4444';
  ctx.shadowBlur = 80;
  ctx.beginPath();
  ctx.arc(100, 150, 120, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
  ctx.fill();

  ctx.shadowColor = '#10b981';
  ctx.beginPath();
  ctx.arc(440, 750, 140, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
  ctx.fill();
  ctx.restore();

  // 3. Card Frame
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(30, 40, w - 60, h - 80, 24);
  ctx.fill();
  ctx.stroke();

  // 4. Header Branding
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 32px Outfit, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('HIIT NA ESTEIRA ⚡', w / 2, 110);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 18px Inter, sans-serif';
  ctx.fillText('TREINO CONCLUÍDO COM SUCESSO', w / 2, 145);

  // Divider Line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.beginPath();
  ctx.moveTo(70, 175);
  ctx.lineTo(w - 70, 175);
  ctx.stroke();

  // 5. Large Flame / Trophy Icon Circle
  ctx.save();
  ctx.shadowColor = '#f59e0b';
  ctx.shadowBlur = 30;
  const iconGrad = ctx.createLinearGradient(w/2 - 55, 200, w/2 + 55, 310);
  iconGrad.addColorStop(0, '#ef4444');
  iconGrad.addColorStop(1, '#f59e0b');
  ctx.fillStyle = iconGrad;
  ctx.beginPath();
  ctx.arc(w / 2, 255, 55, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Flame Emoji Text inside circle
  ctx.font = '54px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🔥', w / 2, 273);

  // 6. Level Badge
  ctx.fillStyle = '#10b981';
  ctx.font = '800 24px Outfit, sans-serif';
  ctx.fillText(`NÍVEL ${workout.preset.toUpperCase()}`, w / 2, 355);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 16px Inter, sans-serif';
  ctx.fillText(workout.date || 'Hoje', w / 2, 385);

  // 7. Big Stats Box Container
  const statBoxY = 430;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(60, statBoxY, w - 120, 320, 20);
  ctx.fill();
  ctx.stroke();

  // Stat Item 1: Duração
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 48px Outfit, sans-serif';
  ctx.fillText(formatTime(workout.durationSec), w / 2, statBoxY + 70);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 16px Inter, sans-serif';
  ctx.fillText('DURAÇÃO TOTAL', w / 2, statBoxY + 95);

  // Stat Item 2: Séries & Calorias
  const col1X = 170;
  const col2X = 370;
  const row2Y = statBoxY + 180;

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 36px Outfit, sans-serif';
  ctx.fillText(`${workout.reps}x`, col1X, row2Y);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 14px Inter, sans-serif';
  ctx.fillText('SÉRIES DE TIRO', col1X, row2Y + 24);

  ctx.fillStyle = '#10b981';
  ctx.font = '800 36px Outfit, sans-serif';
  ctx.fillText(`~${workout.calories}`, col2X, row2Y);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 14px Inter, sans-serif';
  ctx.fillText('EST. CALORIAS', col2X, row2Y + 24);

  // 8. Motivational Quote
  ctx.fillStyle = '#cbd5e1';
  ctx.font = 'italic 600 20px Inter, sans-serif';
  ctx.fillText('"Meta cumprida na esteira! 🏃💨"', w / 2, h - 130);

  // 9. Watermark Footer
  ctx.fillStyle = '#64748b';
  ctx.font = '700 14px Inter, sans-serif';
  ctx.fillText('GERADO PELO HIIT ESTEIRA APP', w / 2, h - 70);
}

// Native Share or Image Share
async function shareWorkoutNative() {
  const w = currentShareWorkout;
  if (!w) return;

  const shareText = `🏃⚡ Concluí meu treino HIIT na Esteira!\n\n🔥 Nível: ${w.preset} (${w.reps} tiros)\n⏱️ Duração: ${formatTime(w.durationSec)}\n💥 Calorias: ~${w.calories} kcal\n\n#HIIT #Esteira #FocoNoTreino #Fitness`;

  const canvas = document.getElementById('shareCanvas');
  
  if (navigator.share && canvas) {
    try {
      // Try converting canvas to Blob image for native share
      canvas.toBlob(async (blob) => {
        if (blob && navigator.canShare && navigator.canShare({ files: [new File([blob], 'hiit_treino.png', { type: 'image/png' })] })) {
          const file = new File([blob], 'hiit_treino.png', { type: 'image/png' });
          await navigator.share({
            title: 'Meu Treino HIIT na Esteira',
            text: shareText,
            files: [file]
          });
        } else {
          // Fallback to text share
          await navigator.share({
            title: 'Meu Treino HIIT na Esteira',
            text: shareText
          });
        }
      });
    } catch (err) {
      console.log('Share canceled or failed:', err);
    }
  } else {
    // Copy text fallback
    copyWorkoutText();
  }
}

function downloadShareImage() {
  const canvas = document.getElementById('shareCanvas');
  if (!canvas) return;
  const image = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.download = `hiit_treino_${Date.now()}.png`;
  link.href = image;
  link.click();
}

function copyWorkoutText() {
  const w = currentShareWorkout;
  if (!w) return;
  const shareText = `🏃⚡ Concluí meu treino HIIT na Esteira!\n\n🔥 Nível: ${w.preset} (${w.reps} tiros)\n⏱️ Duração: ${formatTime(w.durationSec)}\n💥 Calorias: ~${w.calories} kcal\n\n#HIIT #Esteira #FocoNoTreino #Fitness`;

  if (navigator.clipboard) {
    navigator.clipboard.writeText(shareText).then(() => {
      alert("Texto do treino copiado! Cole no Instagram Stories ou WhatsApp.");
    });
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
  const modalShareCard = document.getElementById('modalShareCard');

  document.getElementById('menuItemHome').addEventListener('click', () => {
    dropdownMenu.classList.remove('active');
    if (!state.isRunning) showScreen('screenSelect');
    else showScreen('screenActive');
  });

  document.getElementById('menuItemTips').addEventListener('click', () => {
    dropdownMenu.classList.remove('active');
    modalTips.classList.add('active');
  });

  document.getElementById('menuItemHistory').addEventListener('click', () => {
    dropdownMenu.classList.remove('active');
    renderHistoryScreen();
    showScreen('screenHistory');
  });

  document.getElementById('btnGoToHistory').addEventListener('click', () => {
    renderHistoryScreen();
    showScreen('screenHistory');
  });

  document.getElementById('btnBackFromHistory').addEventListener('click', () => {
    showScreen('screenSelect');
  });

  document.getElementById('btnClearHistoryScreen').addEventListener('click', clearHistory);

  // Share Actions
  document.getElementById('btnShareSummary').addEventListener('click', () => {
    openShareModal(lastWorkoutData);
  });

  document.getElementById('btnCloseShareCard').addEventListener('click', () => {
    modalShareCard.classList.remove('active');
  });

  document.getElementById('btnNativeShare').addEventListener('click', shareWorkoutNative);
  document.getElementById('btnDownloadCard').addEventListener('click', downloadShareImage);
  document.getElementById('btnCopyText').addEventListener('click', copyWorkoutText);

  document.getElementById('btnCloseTips').addEventListener('click', () => {
    modalTips.classList.remove('active');
  });

  // Close Modals on Overlay Click
  [modalTips, modalShareCard].forEach(m => {
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

// Make handleShareItemIndex accessible globally for inline onclick
window.handleShareItemIndex = handleShareItemIndex;

// Run on DOM Content Loaded
document.addEventListener('DOMContentLoaded', initApp);

