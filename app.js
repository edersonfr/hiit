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
  workoutHistory: JSON.parse(localStorage.getItem('hiit_history') || '[]'),
  userProfile: JSON.parse(localStorage.getItem('hiit_user_profile') || JSON.stringify({
    name: 'Atleta',
    weightKg: 70,
    heightCm: 175,
    age: 30,
    gender: 'masculino',
    avatar: '🏃'
  }))
};

function saveUserProfile(profileData) {
  state.userProfile = { ...state.userProfile, ...profileData };
  localStorage.setItem('hiit_user_profile', JSON.stringify(state.userProfile));
  updateProfileUI();
}

function updateProfileUI() {
  const p = state.userProfile;
  const greetingName = document.getElementById('headerUserName');
  const greetingSub = document.getElementById('headerGreetingSub');
  const avatarBox = document.getElementById('headerAvatarBox');
  const previewBox = document.getElementById('profileAvatarPreview');

  if (greetingName) greetingName.textContent = p.name || 'Atleta';
  if (greetingSub) greetingSub.textContent = `Olá, ${p.name || 'Atleta'}! 👋`;
  if (avatarBox) avatarBox.textContent = p.avatar || '🏃';
  if (previewBox) previewBox.textContent = p.avatar || '🏃';

  const inputName = document.getElementById('inputProfileName');
  const inputWeight = document.getElementById('inputProfileWeight');
  const inputHeight = document.getElementById('inputProfileHeight');
  const inputAge = document.getElementById('inputProfileAge');
  const selectGender = document.getElementById('selectProfileGender');

  if (inputName) inputName.value = p.name || 'Atleta';
  if (inputWeight) inputWeight.value = p.weightKg || 70;
  if (inputHeight) inputHeight.value = p.heightCm || 175;
  if (inputAge) inputAge.value = p.age || 30;
  if (selectGender) selectGender.value = p.gender || 'masculino';
}

function speedToMET(spd) {
  if (spd <= 4.0) return 3.0;
  if (spd <= 6.0) return 3.8;
  if (spd <= 8.0) return 6.0;
  if (spd <= 10.0) return 9.8;
  if (spd <= 12.0) return 11.5;
  return 13.5;
}

function calculateCaloriesMET(stages, weightKg = 70) {
  let totalKcal = 0;
  stages.forEach(s => {
    const spd = s.speed || 5.0;
    const durSec = s.duration || 0;
    const met = speedToMET(spd);
    totalKcal += met * weightKg * (durSec / 3600);
  });
  return Math.max(10, Math.round(totalKcal));
}

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

// Math & Pace Helpers
function kmhToPaceStr(kmh) {
  if (!kmh || kmh <= 0) return "0'00\"/km";
  const minutesPerKm = 60 / kmh;
  const mins = Math.floor(minutesPerKm);
  const secs = Math.round((minutesPerKm - mins) * 60);
  const formattedSecs = secs === 60 ? '00' : String(secs).padStart(2, '0');
  const formattedMins = secs === 60 ? mins + 1 : mins;
  return `${formattedMins}'${formattedSecs}"/km`;
}

// Build Workout Stages based on Preset & Speeds
function generateStages() {
  const isQuick = state.quickTestMode;
  const scale = isQuick ? 0.1 : 1.0; // 10x faster in quick test mode

  const stages = [];
  const preset = state.activePreset;

  if (preset === 'iniciante') {
    const reps = parseInt(document.getElementById('repsIniciante').value, 10) || 10;
    const speedWalk = parseFloat(document.getElementById('speedWalkIniciante').value) || 5.5;
    const speedRun = parseFloat(document.getElementById('speedRunIniciante').value) || 9.5;

    const warmupTime = Math.max(2, Math.round(300 * scale)); // 5 min
    const highTime = Math.max(2, Math.round(30 * scale));     // 30s
    const lowTime = Math.max(2, Math.round(60 * scale));      // 60s
    const coolTime = Math.max(2, Math.round(300 * scale));    // 5 min

    stages.push({
      type: 'warmup', title: 'AQUECIMENTO', sub: 'Caminhada leve a moderada na esteira',
      pace: `${speedWalk.toFixed(1)} km/h`, speed: speedWalk, paceStr: kmhToPaceStr(speedWalk),
      duration: warmupTime, icon: '🟢', color: '#10b981', glow: 'rgba(16, 185, 129, 0.35)',
      tip: 'Comece com velocidade confortável e inclinação plana (0-2%).'
    });

    for (let i = 1; i <= reps; i++) {
      stages.push({
        type: 'high', title: 'TIRO - ALTA INTENSIDADE', sub: 'Corrida rápida / esforço intenso',
        pace: `${speedRun.toFixed(1)} km/h`, speed: speedRun, paceStr: kmhToPaceStr(speedRun),
        duration: highTime, rep: i, totalReps: reps, icon: '🔴', color: '#ef4444', glow: 'rgba(239, 68, 68, 0.4)',
        tip: 'Fique ofegante! Dificuldade de conversar durante o tiro.'
      });
      stages.push({
        type: 'low', title: 'DESCANSO - CAMINHADA', sub: 'Caminhada leve para recuperar o fôlego',
        pace: `${speedWalk.toFixed(1)} km/h`, speed: speedWalk, paceStr: kmhToPaceStr(speedWalk),
        duration: lowTime, rep: i, totalReps: reps, icon: '🟡', color: '#f59e0b', glow: 'rgba(245, 158, 11, 0.35)',
        tip: 'Respire fundo e recupere os batimentos cardíacos.'
      });
    }

    stages.push({
      type: 'cooldown', title: 'DESACELERAÇÃO', sub: 'Caminhada leve final',
      pace: `${(speedWalk * 0.9).toFixed(1)} km/h`, speed: Math.max(3.0, speedWalk * 0.9), paceStr: kmhToPaceStr(Math.max(3.0, speedWalk * 0.9)),
      duration: coolTime, icon: '🔵', color: '#06b6d4', glow: 'rgba(6, 182, 212, 0.35)',
      tip: 'Diminua o ritmo aos poucos até a frequência cardíaca voltar ao normal.'
    });

  } else if (preset === 'intermediario') {
    const restSec = parseInt(document.getElementById('restIntermediario').value, 10) || 45;
    const reps = parseInt(document.getElementById('repsIntermediario').value, 10) || 10;
    const speedWalk = parseFloat(document.getElementById('speedWalkIntermediario').value) || 6.0;
    const speedRun = parseFloat(document.getElementById('speedRunIntermediario').value) || 11.0;

    const warmupTime = Math.max(2, Math.round(300 * scale));
    const highTime = Math.max(2, Math.round(30 * scale));
    const lowTime = Math.max(2, Math.round(restSec * scale));
    const coolTime = Math.max(2, Math.round(300 * scale));

    stages.push({
      type: 'warmup', title: 'AQUECIMENTO', sub: 'Caminhada leve a moderada na esteira',
      pace: `${speedWalk.toFixed(1)} km/h`, speed: speedWalk, paceStr: kmhToPaceStr(speedWalk),
      duration: warmupTime, icon: '🟢', color: '#10b981', glow: 'rgba(16, 185, 129, 0.35)',
      tip: 'Prepare seus músculos para a corrida forte.'
    });

    for (let i = 1; i <= reps; i++) {
      stages.push({
        type: 'high', title: 'TIRO - ALTA INTENSIDADE', sub: 'Corrida forte',
        pace: `${speedRun.toFixed(1)} km/h`, speed: speedRun, paceStr: kmhToPaceStr(speedRun),
        duration: highTime, rep: i, totalReps: reps, icon: '🔴', color: '#ef4444', glow: 'rgba(239, 68, 68, 0.4)',
        tip: 'Postura ereta e abdômen contraído!'
      });
      stages.push({
        type: 'low', title: 'DESCANSO - CAMINHADA', sub: 'Caminhada de recuperação',
        pace: `${speedWalk.toFixed(1)} km/h`, speed: speedWalk, paceStr: kmhToPaceStr(speedWalk),
        duration: lowTime, rep: i, totalReps: reps, icon: '🟡', color: '#f59e0b', glow: 'rgba(245, 158, 11, 0.35)',
        tip: 'Diminua a velocidade da esteira para recuperar.'
      });
    }

    stages.push({
      type: 'cooldown', title: 'DESACELERAÇÃO', sub: 'Caminhada leve final',
      pace: `${(speedWalk * 0.9).toFixed(1)} km/h`, speed: Math.max(3.0, speedWalk * 0.9), paceStr: kmhToPaceStr(Math.max(3.0, speedWalk * 0.9)),
      duration: coolTime, icon: '🔵', color: '#06b6d4', glow: 'rgba(6, 182, 212, 0.35)',
      tip: 'Ótimo trabalho! Desacelere suavemente.'
    });

  } else if (preset === 'avancado') {
    const reps = parseInt(document.getElementById('repsAvancado').value, 10) || 12;
    const speedWalk = parseFloat(document.getElementById('speedWalkAvancado').value) || 6.5;
    const speedRun = parseFloat(document.getElementById('speedRunAvancado').value) || 13.0;

    const warmupTime = Math.max(2, Math.round(300 * scale));
    const highTime = Math.max(2, Math.round(40 * scale));
    const lowTime = Math.max(2, Math.round(20 * scale));
    const coolTime = Math.max(2, Math.round(300 * scale));

    stages.push({
      type: 'warmup', title: 'AQUECIMENTO', sub: 'Caminhada leve a moderada',
      pace: `${speedWalk.toFixed(1)} km/h`, speed: speedWalk, paceStr: kmhToPaceStr(speedWalk),
      duration: warmupTime, icon: '🟢', color: '#10b981', glow: 'rgba(16, 185, 129, 0.35)',
      tip: 'Foco e aquecimento completo para treino avançado.'
    });

    for (let i = 1; i <= reps; i++) {
      stages.push({
        type: 'high', title: 'TIRO INTENSO (40s)', sub: 'Corrida em velocidade máxima',
        pace: `${speedRun.toFixed(1)} km/h`, speed: speedRun, paceStr: kmhToPaceStr(speedRun),
        duration: highTime, rep: i, totalReps: reps, icon: '🔴', color: '#ef4444', glow: 'rgba(239, 68, 68, 0.4)',
        tip: 'Máxima explosão! Mantenha o foco até o bip.'
      });
      stages.push({
        type: 'low', title: 'DESCANSO RÁPIDO (20s)', sub: 'Caminhada curta de transição',
        pace: `${speedWalk.toFixed(1)} km/h`, speed: speedWalk, paceStr: kmhToPaceStr(speedWalk),
        duration: lowTime, rep: i, totalReps: reps, icon: '🟡', color: '#f59e0b', glow: 'rgba(245, 158, 11, 0.35)',
        tip: 'Descanso curto! Fique pronto para o próximo tiro.'
      });
    }

    stages.push({
      type: 'cooldown', title: 'DESACELERAÇÃO', sub: 'Caminhada leve final (5 min)',
      pace: `${(speedWalk * 0.9).toFixed(1)} km/h`, speed: Math.max(3.0, speedWalk * 0.9), paceStr: kmhToPaceStr(Math.max(3.0, speedWalk * 0.9)),
      duration: coolTime, icon: '🔵', color: '#06b6d4', glow: 'rgba(6, 182, 212, 0.35)',
      tip: 'Desaceleração essencial para baixar os batimentos com segurança.'
    });

  } else if (preset === 'custom') {
    const warmupMin = parseInt(document.getElementById('customWarmup').value, 10) || 5;
    const highSec = parseInt(document.getElementById('customHigh').value, 10) || 30;
    const lowSec = parseInt(document.getElementById('customLow').value, 10) || 45;
    const reps = parseInt(document.getElementById('customReps').value, 10) || 10;
    const speedWalk = parseFloat(document.getElementById('speedWalkCustom').value) || 5.5;
    const speedRun = parseFloat(document.getElementById('speedRunCustom').value) || 10.5;

    const warmupTime = Math.max(2, Math.round((warmupMin * 60) * scale));
    const highTime = Math.max(2, Math.round(highSec * scale));
    const lowTime = Math.max(2, Math.round(lowSec * scale));
    const coolTime = Math.max(2, Math.round(300 * scale));

    stages.push({
      type: 'warmup', title: 'AQUECIMENTO', sub: 'Caminhada leve a moderada',
      pace: `${speedWalk.toFixed(1)} km/h`, speed: speedWalk, paceStr: kmhToPaceStr(speedWalk),
      duration: warmupTime, icon: '🟢', color: '#10b981', glow: 'rgba(16, 185, 129, 0.35)',
      tip: 'Aquecimento personalizado.'
    });

    for (let i = 1; i <= reps; i++) {
      stages.push({
        type: 'high', title: 'TIRO - INTENSIDADE', sub: 'Corrida alta intensidade',
        pace: `${speedRun.toFixed(1)} km/h`, speed: speedRun, paceStr: kmhToPaceStr(speedRun),
        duration: highTime, rep: i, totalReps: reps, icon: '🔴', color: '#ef4444', glow: 'rgba(239, 68, 68, 0.4)',
        tip: 'Dê o seu melhor durante o tiro!'
      });
      stages.push({
        type: 'low', title: 'DESCANSO', sub: 'Caminhada de recuperação',
        pace: `${speedWalk.toFixed(1)} km/h`, speed: speedWalk, paceStr: kmhToPaceStr(speedWalk),
        duration: lowTime, rep: i, totalReps: reps, icon: '🟡', color: '#f59e0b', glow: 'rgba(245, 158, 11, 0.35)',
        tip: 'Recupere o fôlego.'
      });
    }

    stages.push({
      type: 'cooldown', title: 'DESACELERAÇÃO', sub: 'Caminhada leve final',
      pace: `${(speedWalk * 0.9).toFixed(1)} km/h`, speed: Math.max(3.0, speedWalk * 0.9), paceStr: kmhToPaceStr(Math.max(3.0, speedWalk * 0.9)),
      duration: coolTime, icon: '🔵', color: '#06b6d4', glow: 'rgba(6, 182, 212, 0.35)',
      tip: 'Finalize reduzindo a caminhada.'
    });
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
    const tabHome = document.getElementById('navItemHome');
    if (tabHome) tabHome.classList.add('active');
    const tabHistory = document.getElementById('navItemHistory');
    if (tabHistory) tabHistory.classList.remove('active');
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

  const phaseBanner = document.getElementById('phaseBanner');
  if (phaseBanner) {
    phaseBanner.style.backgroundColor = stage.color;
  }
  const progressCircle = document.getElementById('progressCircle');
  if (progressCircle) {
    progressCircle.style.stroke = stage.color;
  }

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
      document.getElementById('displayNextPhase').textContent = `🔴 TIRO (${nextStage.speed ? nextStage.speed.toFixed(1) : ''} km/h)`;
    } else if (nextStage.type === 'low') {
      document.getElementById('displayNextPhase').textContent = `🟡 CAMINHADA (${nextStage.speed ? nextStage.speed.toFixed(1) : ''} km/h)`;
    } else if (nextStage.type === 'cooldown') {
      document.getElementById('displayNextPhase').textContent = '🔵 FIM/DESAC.';
    } else {
      document.getElementById('displayNextPhase').textContent = nextStage.pace;
    }
  } else {
    document.getElementById('displayNextPhase').textContent = 'FIM 🎉';
  }

  // Suggested Speed & Pace
  const spdVal = stage.speed ? stage.speed.toFixed(1) : stage.pace;
  document.getElementById('displaySuggestedPace').textContent = `${spdVal} km/h`;
  const paceSub = document.getElementById('displaySuggestedPaceSub');
  if (paceSub) {
    paceSub.textContent = `Pace: ${stage.paceStr || kmhToPaceStr(stage.speed)}`;
  }
  
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
  const spd = firstStage.speed ? `${String(firstStage.speed.toFixed(1)).replace('.', ',')} km por hora` : '';
  speakPrompt(`Iniciando treino HIIT. ${firstStage.title}. Velociade de ${spd}.`);

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
      const spd = next.speed ? `${String(next.speed.toFixed(1)).replace('.', ',')} km por hora` : '';
      speakPrompt(`Atenção! Prepara para o tiro em ${spd}!`);
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
      const spd = newStage.speed ? `${String(newStage.speed.toFixed(1)).replace('.', ',')} km por hora` : '';

      // Voice cues on stage entry
      if (newStage.type === 'high') {
        speakPrompt(`Aumente para ${spd}! Tiro ${newStage.rep} de ${newStage.totalReps}! Corrida!`);
      } else if (newStage.type === 'low') {
        speakPrompt(`Reduza para ${spd}. Caminhada de descanso.`);
      } else if (newStage.type === 'cooldown') {
        speakPrompt(`Excelente! Desaceleração final em ${spd}.`);
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

// Render High-DPI & Responsive Workout Graph Canvas
function renderWorkoutChart(canvas, stages) {
  if (!canvas || !stages || stages.length === 0) return;

  const parent = canvas.parentElement;
  const parentW = parent ? parent.clientWidth : 0;
  const displayWidth = parentW > 0 ? (parentW - 16) : (canvas.clientWidth || 340);
  const displayHeight = parseInt(canvas.getAttribute('height'), 10) || 180;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(displayWidth * dpr);
  canvas.height = Math.round(displayHeight * dpr);

  const ctx = canvas.getContext('2d');
  if (ctx.resetTransform) {
    ctx.resetTransform();
  } else {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  ctx.scale(dpr, dpr);

  const width = displayWidth;
  const height = displayHeight;

  ctx.clearRect(0, 0, width, height);

  const padL = 28;
  const padR = 12;
  const padT = 20;
  const padB = 24;
  const graphW = width - padL - padR;
  const graphH = height - padT - padB;

  let totalDuration = 0;
  let maxSpeed = 0;
  stages.forEach(s => {
    totalDuration += (s.duration || 0);
    if ((s.speed || 0) > maxSpeed) maxSpeed = s.speed;
  });

  if (totalDuration === 0) return;
  maxSpeed = Math.max(maxSpeed * 1.15, 12);

  // Background Grid Lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
  ctx.lineWidth = 1;
  const ySteps = 4;
  for (let i = 0; i <= ySteps; i++) {
    const yVal = (maxSpeed / ySteps) * i;
    const yPos = padT + graphH - (i / ySteps) * graphH;
    ctx.beginPath();
    ctx.moveTo(padL, yPos);
    ctx.lineTo(width - padR, yPos);
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = '600 10px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${yVal.toFixed(0)}`, padL - 5, yPos + 3);
  }

  // Draw Stepped Profile Area & Lines
  let currentSec = 0;

  stages.forEach((s) => {
    const stageDuration = s.duration || 0;
    const startX = padL + (currentSec / totalDuration) * graphW;
    const endX = padL + ((currentSec + stageDuration) / totalDuration) * graphW;
    const speedY = padT + graphH - ((s.speed || 5) / maxSpeed) * graphH;
    const zeroY = padT + graphH;

    // Filled Gradient Area
    ctx.save();
    const grad = ctx.createLinearGradient(0, speedY, 0, zeroY);
    grad.addColorStop(0, s.color || '#10b981');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0.1)');
    ctx.fillStyle = grad;

    ctx.beginPath();
    ctx.moveTo(startX, zeroY);
    ctx.lineTo(startX, speedY);
    ctx.lineTo(endX, speedY);
    ctx.lineTo(endX, zeroY);
    ctx.closePath();
    ctx.fill();

    // Top border line
    ctx.strokeStyle = s.color || '#10b981';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(startX, speedY);
    ctx.lineTo(endX, speedY);
    ctx.stroke();

    // Vertical Divider
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(startX, zeroY);
    ctx.lineTo(startX, speedY);
    ctx.stroke();

    // Label on high intensity tiro
    if (s.type === 'high' && (endX - startX) > 10) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${s.speed}`, (startX + endX) / 2, speedY - 4);
    }

    ctx.restore();
    currentSec += stageDuration;
  });

  // Time Axis (X Labels)
  ctx.fillStyle = '#64748b';
  ctx.font = '600 10px Inter, sans-serif';
  ctx.textAlign = 'center';
  const xSteps = 5;
  for (let i = 0; i <= xSteps; i++) {
    const timeSec = (totalDuration / xSteps) * i;
    const xPos = padL + (i / xSteps) * graphW;
    const mins = Math.floor(timeSec / 60);
    ctx.fillText(`${mins}'`, xPos, height - 4);
  }
}

// Finish Workout
function finishWorkout() {
  resetTimerState();
  playFanfare();
  vibratePattern([200, 100, 200, 100, 400]);
  speakPrompt("Parabéns! Treino concluído com sucesso! Excelente trabalho!");

  // Compute Pace & Distance stats
  const totalSecs = state.totalElapsedSeconds || 1;
  const highStages = state.stages.filter(s => s.type === 'high');
  const totalReps = highStages.length;

  let totalDistKm = 0;
  let maxSpeedKmH = 0;

  state.stages.forEach(s => {
    const spd = s.speed || 5.0;
    if (spd > maxSpeedKmH) maxSpeedKmH = spd;
    totalDistKm += (spd * (s.duration / 3600));
  });

  const avgSpeedKmH = totalDistKm > 0 ? (totalDistKm / (totalSecs / 3600)) : 0;
  const avgPaceStr = kmhToPaceStr(avgSpeedKmH);

  const presetNames = {
    'iniciante': 'Iniciante',
    'intermediario': 'Intermediário',
    'avancado': 'Avançado',
    'custom': 'Personalizado'
  };

  // Accurate MET-based calories using User Weight
  const userWeight = (state.userProfile && state.userProfile.weightKg) ? parseFloat(state.userProfile.weightKg) : 70;
  const estCalories = calculateCaloriesMET(state.stages, userWeight);

  const setElText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  setElText('summaryTime', formatTime(totalSecs));
  setElText('summaryDistance', `${totalDistKm.toFixed(2)} km`);
  setElText('summaryAvgPace', avgPaceStr);
  setElText('summaryAvgSpeed', `${avgSpeedKmH.toFixed(1)} km/h`);
  setElText('summaryMaxSpeed', `${maxSpeedKmH.toFixed(1)} km/h`);
  setElText('summaryReps', `${totalReps}/${totalReps}`);
  setElText('summaryPreset', presetNames[state.activePreset] || 'Iniciante');
  setElText('summaryCalories', `~${estCalories} kcal`);

  // Render Workout Intensity Graph
  setTimeout(() => {
    const canvas = document.getElementById('summaryChartCanvas');
    if (canvas) renderWorkoutChart(canvas, state.stages);
  }, 50);

  // Save to History
  saveHistoryItem({
    date: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    preset: presetNames[state.activePreset] || 'Iniciante',
    durationSec: totalSecs,
    reps: totalReps,
    calories: estCalories,
    distanceKm: parseFloat(totalDistKm.toFixed(2)),
    avgSpeedKmH: parseFloat(avgSpeedKmH.toFixed(1)),
    avgPaceStr: avgPaceStr,
    maxSpeedKmH: parseFloat(maxSpeedKmH.toFixed(1)),
    stages: state.stages
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
  let totalDistKm = 0;

  history.forEach(h => {
    totalCalories += (h.calories || 0);
    totalSecs += (h.durationSec || 0);
    totalDistKm += (h.distanceKm || 0);
  });

  document.getElementById('totalWorkoutsCount').textContent = totalCount;
  const distEl = document.getElementById('totalDistanceCount');
  if (distEl) distEl.textContent = `${totalDistKm.toFixed(1)} km`;
  document.getElementById('totalCaloriesCount').textContent = totalCalories > 0 ? `${totalCalories} kcal` : '0 kcal';
  document.getElementById('totalMinutesCount').textContent = `${Math.round(totalSecs / 60)} min`;

  if (history.length === 0) {
    container.innerHTML = `
      <div class="empty-history bg-white border border-slate-200 rounded-3xl p-8 text-center shadow-sm flex flex-col items-center justify-center gap-2">
        <div class="text-4xl mb-1">🏃💨</div>
        <div class="font-heading font-extrabold text-slate-900 text-base">Nenhum treino registrado ainda</div>
        <div class="text-xs text-slate-500 font-medium">Escolha um nível de treino e comece seu primeiro HIIT na esteira!</div>
      </div>
    `;
    return;
  }

  const badgeClasses = {
    'Iniciante': 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    'Intermediário': 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    'Avançado': 'bg-red-500/10 text-red-600 border-red-500/20',
    'Personalizado': 'bg-purple-500/10 text-purple-600 border-purple-500/20'
  };

  container.innerHTML = history.map((item, index) => {
    const badgeStyle = badgeClasses[item.preset] || badgeClasses['Iniciante'];
    return `
    <div class="history-card-item bg-white border border-slate-200 rounded-3xl p-4 shadow-sm flex flex-col gap-3 transition hover:shadow-md">
      <div class="history-card-top flex items-center justify-between">
        <span class="preset-badge text-[11px] font-extrabold uppercase px-3 py-1 rounded-full border ${badgeStyle}">
          ${item.preset} (${item.reps} tiros)
        </span>
        <span class="history-card-date text-xs font-semibold text-slate-400">${item.date}</span>
      </div>

      <div class="history-card-body grid grid-cols-4 gap-2 text-center py-2.5 px-2 bg-slate-50 rounded-2xl border border-slate-100">
        <div>
          <div class="card-stat-val font-heading font-black text-sm text-slate-900">${formatTime(item.durationSec)}</div>
          <div class="card-stat-lbl text-[10px] font-semibold text-slate-500 uppercase mt-0.5">Tempo</div>
        </div>
        <div>
          <div class="card-stat-val font-heading font-black text-sm text-blue-600">${item.distanceKm ? item.distanceKm.toFixed(2) : '--'} km</div>
          <div class="card-stat-lbl text-[10px] font-semibold text-slate-500 uppercase mt-0.5">Distância</div>
        </div>
        <div>
          <div class="card-stat-val font-heading font-black text-sm text-amber-600">${item.avgPaceStr || '--'}</div>
          <div class="card-stat-lbl text-[10px] font-semibold text-slate-500 uppercase mt-0.5">Pace</div>
        </div>
        <div>
          <div class="card-stat-val font-heading font-black text-sm text-emerald-600">~${item.calories} kcal</div>
          <div class="card-stat-lbl text-[10px] font-semibold text-slate-500 uppercase mt-0.5">Calorias</div>
        </div>
      </div>

      ${item.stages && item.stages.length ? `
        <div class="chart-box bg-slate-900 p-2.5 rounded-2xl border border-slate-800">
          <canvas id="histChart_${index}" width="400" height="90" class="w-full h-[60px]"></canvas>
        </div>
      ` : ''}

      <div class="history-card-footer flex justify-end pt-0.5">
        <button class="btn-share-mini text-xs font-bold text-purple-600 hover:text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200/80 px-3.5 py-1.5 rounded-xl transition flex items-center gap-1.5 cursor-pointer" onclick="handleShareItemIndex(${index})">
          <svg viewBox="0 0 24 24" class="w-4 h-4 fill-current"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>
          Compartilhar
        </button>
      </div>
    </div>
  `;
  }).join('');

  // Render mini charts for each history item
  setTimeout(() => {
    history.forEach((item, index) => {
      if (item.stages && item.stages.length) {
        const c = document.getElementById(`histChart_${index}`);
        if (c) renderWorkoutChart(c, item.stages);
      }
    });
  }, 60);
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
    distanceKm: 2.85,
    avgPaceStr: '5\'27"/km',
    avgSpeedKmH: 11.0,
    maxSpeedKmH: 13.0,
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

  ctx.clearRect(0, 0, w, h);

  // 1. Sleek Dark Gradient Background
  const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
  bgGrad.addColorStop(0, '#0f172a');
  bgGrad.addColorStop(0.35, '#090d16');
  bgGrad.addColorStop(0.75, '#1e1b4b');
  bgGrad.addColorStop(1, '#0f172a');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // 2. Dynamic Glowing Orbs Background
  ctx.save();
  // Red Orb top-left
  ctx.shadowColor = '#ef4444';
  ctx.shadowBlur = 95;
  ctx.beginPath();
  ctx.arc(80, 110, 100, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(239, 68, 68, 0.22)';
  ctx.fill();

  // Emerald Orb bottom-right
  ctx.shadowColor = '#10b981';
  ctx.shadowBlur = 95;
  ctx.beginPath();
  ctx.arc(460, 810, 120, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
  ctx.fill();

  // Blue Orb center
  ctx.shadowColor = '#3b82f6';
  ctx.shadowBlur = 95;
  ctx.beginPath();
  ctx.arc(270, 480, 140, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(59, 130, 246, 0.12)';
  ctx.fill();
  ctx.restore();

  // 3. Subtle Card Glassmorphism Frame
  ctx.save();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(24, 28, w - 48, h - 56, 28);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // 4. Header Branding: App Icon & Name
  const badgeX = w / 2 - 32;
  const badgeY = 56;
  ctx.save();
  ctx.shadowColor = 'rgba(239, 68, 68, 0.4)';
  ctx.shadowBlur = 18;
  const iconGrad = ctx.createLinearGradient(badgeX, badgeY, badgeX + 64, badgeY + 64);
  iconGrad.addColorStop(0, '#ef4444');
  iconGrad.addColorStop(0.5, '#f59e0b');
  iconGrad.addColorStop(1, '#10b981');
  ctx.fillStyle = iconGrad;
  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, 64, 64, 18);
  ctx.fill();
  ctx.restore();

  ctx.font = '36px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('⚡', w / 2, badgeY + 44);

  // App Title
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 30px Outfit, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('HIIT ESTEIRA', w / 2, badgeY + 102);

  // User Profile Name & Tagline
  const userName = (state.userProfile && state.userProfile.name) ? state.userProfile.name : 'Atleta';
  const userAvatar = (state.userProfile && state.userProfile.avatar) ? state.userProfile.avatar : '🏃';
  ctx.fillStyle = '#94a3b8';
  ctx.font = '600 15px Inter, sans-serif';
  ctx.fillText(`${userAvatar} ${userName} • Treino Concluído!`, w / 2, badgeY + 126);

  // Divider Line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(60, badgeY + 144);
  ctx.lineTo(w - 60, badgeY + 144);
  ctx.stroke();

  // 5. Preset Level Pill & Date
  const presetKey = (workout.preset || 'Iniciante').toLowerCase();
  let badgeBg = 'rgba(16, 185, 129, 0.18)';
  let badgeBorder = '#10b981';
  let badgeText = '#34d399';
  let badgeIcon = '🟢';

  if (presetKey.includes('intermed')) {
    badgeBg = 'rgba(245, 158, 11, 0.18)';
    badgeBorder = '#f59e0b';
    badgeText = '#fbbf24';
    badgeIcon = '🟡';
  } else if (presetKey.includes('avan') || presetKey.includes('avança')) {
    badgeBg = 'rgba(239, 68, 68, 0.18)';
    badgeBorder = '#ef4444';
    badgeText = '#f87171';
    badgeIcon = '🔴';
  } else if (presetKey.includes('custom') || presetKey.includes('personalizad')) {
    badgeBg = 'rgba(168, 85, 247, 0.18)';
    badgeBorder = '#a855f7';
    badgeText = '#c084fc';
    badgeIcon = '⚙️';
  }

  // Draw Level Pill
  const pillY = 224;
  ctx.fillStyle = badgeBg;
  ctx.strokeStyle = badgeBorder;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(w / 2 - 120, pillY, 240, 36, 18);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = badgeText;
  ctx.font = '800 14px Outfit, sans-serif';
  ctx.fillText(`${badgeIcon} NÍVEL ${(workout.preset || 'Iniciante').toUpperCase()}`, w / 2, pillY + 23);

  // Date
  ctx.fillStyle = '#64748b';
  ctx.font = '600 13px Inter, sans-serif';
  ctx.fillText(workout.date || 'Hoje', w / 2, pillY + 58);

  // 6. Stats Grid Container (6 Metrics in 2x3 Grid)
  const gridY = 310;
  const cardW = 220;
  const cardH = 92;
  const col1X = 40;
  const col2X = 280;

  const statsList = [
    { label: 'TEMPO TOTAL', val: formatTime(workout.durationSec), color: '#ffffff', sub: 'Minutos em HIIT' },
    { label: 'DISTÂNCIA EST.', val: `${workout.distanceKm ? workout.distanceKm.toFixed(2) : '0.00'} km`, color: '#60a5fa', sub: 'Quilômetros' },
    { label: 'PACE MÉDIO', val: workout.avgPaceStr || '--', color: '#fbbf24', sub: 'Min / km' },
    { label: 'VEL. MÁXIMA', val: `${workout.maxSpeedKmH ? workout.maxSpeedKmH.toFixed(1) : '--'} km/h`, color: '#f87171', sub: 'Pico de Tiro' },
    { label: 'SÉRIES DE TIRO', val: `${workout.reps || 0} tiros`, color: '#c084fc', sub: 'Alta Intensidade' },
    { label: 'CALORIAS (MET)', val: `~${workout.calories || 0} kcal`, color: '#34d399', sub: 'Gasto Estimado' }
  ];

  statsList.forEach((st, idx) => {
    const row = Math.floor(idx / 2);
    const col = idx % 2;
    const x = col === 0 ? col1X : col2X;
    const y = gridY + row * (cardH + 12);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, cardW, cardH, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = st.color;
    ctx.font = '900 24px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(st.val, x + cardW / 2, y + 38);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '700 11px Inter, sans-serif';
    ctx.fillText(st.label, x + cardW / 2, y + 58);

    ctx.fillStyle = '#64748b';
    ctx.font = '500 10px Inter, sans-serif';
    ctx.fillText(st.sub, x + cardW / 2, y + 74);
  });

  // 7. Graph Preview Box (Velocity Profile Graph)
  if (workout.stages && workout.stages.length) {
    const chartY = gridY + 3 * (cardH + 12) + 6; // ~628
    const chartBoxW = w - 80;
    const chartBoxH = 160;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(40, chartY, chartBoxW, chartBoxH, 20);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 12px Outfit, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('📈 PERFIL DE INTENSIDADES DO TREINO', 56, chartY + 24);

    // Mini Chart Render onto temp canvas
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 440;
    tempCanvas.height = 110;
    renderWorkoutChart(tempCanvas, workout.stages);
    ctx.drawImage(tempCanvas, 52, chartY + 32, chartBoxW - 24, 115);
  }

  // 8. Motivational Banner Quote & App Footer Watermark
  const footerY = h - 75;
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'italic 700 16px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('"Treino concluído na esteira! 🏃💨"', w / 2, footerY);

  ctx.fillStyle = '#64748b';
  ctx.font = '700 12px Inter, sans-serif';
  ctx.fillText('GERADO PELO HIIT ESTEIRA APP', w / 2, footerY + 24);
}
}

// Native Share or Image Share
async function shareWorkoutNative() {
  const w = currentShareWorkout;
  if (!w) return;

  const shareText = `🏃⚡ Concluí meu treino HIIT na Esteira!\n\n🔥 Nível: ${w.preset} (${w.reps} tiros)\n⏱️ Duração: ${formatTime(w.durationSec)}\n📍 Distância: ${w.distanceKm ? w.distanceKm.toFixed(2) : '2.50'} km\n⚡ Pace Médio: ${w.avgPaceStr || '5\'30"/km'}\n🚀 Vel. Máxima: ${w.maxSpeedKmH ? w.maxSpeedKmH.toFixed(1) : '12.0'} km/h\n💥 Calorias: ~${w.calories} kcal\n\n#HIIT #Esteira #FocoNoTreino #Fitness`;

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
  const shareText = `🏃⚡ Concluí meu treino HIIT na Esteira!\n\n🔥 Nível: ${w.preset} (${w.reps} tiros)\n⏱️ Duração: ${formatTime(w.durationSec)}\n📍 Distância: ${w.distanceKm ? w.distanceKm.toFixed(2) : '2.50'} km\n⚡ Pace Médio: ${w.avgPaceStr || '5\'30"/km'}\n🚀 Vel. Máxima: ${w.maxSpeedKmH ? w.maxSpeedKmH.toFixed(1) : '12.0'} km/h\n💥 Calorias: ~${w.calories} kcal\n\n#HIIT #Esteira #FocoNoTreino #Fitness`;

  if (navigator.clipboard) {
    navigator.clipboard.writeText(shareText).then(() => {
      alert("Texto do treino copiado! Cole no Instagram Stories ou WhatsApp.");
    });
  }
}

// Initialize Event Listeners & Preset Selectors
function initApp() {
  // Preset Selection Cards
  // Level Selector Chips
  const chips = document.querySelectorAll('.level-chip');
  const presetCards = document.querySelectorAll('.preset-card');

  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');

      const selectedPreset = chip.dataset.preset;
      state.activePreset = selectedPreset;

      // Show matching preset card, hide others
      presetCards.forEach(card => {
        if (card.dataset.preset === selectedPreset) {
          card.style.display = 'block';
          card.classList.add('selected');
        } else {
          card.style.display = 'none';
          card.classList.remove('selected');
        }
      });
    });
  });

  // Preset Selection Cards Click Handler
  presetCards.forEach(card => {
    card.addEventListener('click', () => {
      const preset = card.dataset.preset;
      state.activePreset = preset;
      
      chips.forEach(c => {
        c.classList.toggle('active', c.dataset.preset === preset);
      });

      presetCards.forEach(c => {
        if (c.dataset.preset === preset) {
          c.style.display = 'block';
          c.classList.add('selected');
        } else {
          c.style.display = 'none';
          c.classList.remove('selected');
        }
      });
    });
  });

  // Floating Bottom Navigation Bar Handlers
  const navItemHome = document.getElementById('navItemHome');
  const navItemHistory = document.getElementById('navItemHistory');
  const btnNavStartWorkout = document.getElementById('btnNavStartWorkout');
  const btnHeaderHistory = document.getElementById('btnHeaderHistory');

  if (navItemHome) {
    navItemHome.addEventListener('click', () => {
      updateNavTabs('navItemHome');
      if (!state.isRunning) showScreen('screenSelect');
      else showScreen('screenActive');
    });
  }

  if (navItemHistory) {
    navItemHistory.addEventListener('click', () => {
      updateNavTabs('navItemHistory');
      renderHistoryScreen();
      showScreen('screenHistory');
    });
  }

  if (btnHeaderHistory) {
    btnHeaderHistory.addEventListener('click', () => {
      updateNavTabs('navItemHistory');
      renderHistoryScreen();
      showScreen('screenHistory');
    });
  }

  if (btnNavStartWorkout) {
    btnNavStartWorkout.addEventListener('click', startWorkout);
  }

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
  const btnStart = document.getElementById('btnStartWorkout');
  if (btnStart) btnStart.addEventListener('click', startWorkout);

  document.getElementById('btnNewWorkout').addEventListener('click', () => showScreen('screenSelect'));

  // Timer Controls
  document.getElementById('btnPauseResume').addEventListener('click', togglePauseResume);
  document.getElementById('btnSkipStage').addEventListener('click', skipStage);
  document.getElementById('btnStopWorkout').addEventListener('click', stopWorkout);

  // History Screen Navigation Buttons
  const btnBackFromHistory = document.getElementById('btnBackFromHistory');
  if (btnBackFromHistory) {
    btnBackFromHistory.addEventListener('click', () => {
      if (state.isRunning) {
        showScreen('screenActive');
      } else {
        updateNavTabs('navItemHome');
        showScreen('screenSelect');
      }
    });
  }

  const btnGoToHistory = document.getElementById('btnGoToHistory');
  if (btnGoToHistory) {
    btnGoToHistory.addEventListener('click', () => {
      updateNavTabs('navItemHistory');
      renderHistoryScreen();
      showScreen('screenHistory');
    });
  }

  const btnClearHistoryScreen = document.getElementById('btnClearHistoryScreen');
  if (btnClearHistoryScreen) {
    btnClearHistoryScreen.addEventListener('click', clearHistory);
  }

  // 3-Dots Dropdown Menu Toggle & Items
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

  const menuItemHome = document.getElementById('menuItemHome');
  if (menuItemHome) {
    menuItemHome.addEventListener('click', () => {
      if (dropdownMenu) dropdownMenu.classList.remove('active');
      updateNavTabs('navItemHome');
      if (!state.isRunning) showScreen('screenSelect');
      else showScreen('screenActive');
    });
  }

  const menuItemHistory = document.getElementById('menuItemHistory');
  if (menuItemHistory) {
    menuItemHistory.addEventListener('click', () => {
      if (dropdownMenu) dropdownMenu.classList.remove('active');
      updateNavTabs('navItemHistory');
      renderHistoryScreen();
      showScreen('screenHistory');
    });
  }

  // Modals & Share Handlers
  const modalShareCard = document.getElementById('modalShareCard');
  const modalProfile = document.getElementById('modalProfile');
  const btnShareSummary = document.getElementById('btnShareSummary');
  const btnCloseShareCard = document.getElementById('btnCloseShareCard');
  const btnNativeShare = document.getElementById('btnNativeShare');
  const btnDownloadCard = document.getElementById('btnDownloadCard');
  const btnCopyText = document.getElementById('btnCopyText');

  if (btnShareSummary) {
    btnShareSummary.addEventListener('click', () => {
      openShareModal();
    });
  }

  if (btnCloseShareCard) {
    btnCloseShareCard.addEventListener('click', () => {
      if (modalShareCard) modalShareCard.classList.remove('active');
    });
  }

  if (btnDownloadCard) {
    btnDownloadCard.addEventListener('click', () => {
      const canvas = document.getElementById('shareCanvas');
      if (!canvas) return;
      const link = document.createElement('a');
      link.download = `hiit-esteira-treino-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    });
  }

  if (btnNativeShare) {
    btnNativeShare.addEventListener('click', async () => {
      const canvas = document.getElementById('shareCanvas');
      if (!canvas) return;
      try {
        canvas.toBlob(async (blob) => {
          if (blob && navigator.share && navigator.canShare && navigator.canShare({ files: [new File([blob], 'treino-hiit.png', { type: 'image/png' })] })) {
            const file = new File([blob], 'treino-hiit.png', { type: 'image/png' });
            await navigator.share({
              title: 'Meu Treino HIIT na Esteira 🏃⚡',
              text: 'Confira meu resultado no HIIT Esteira!',
              files: [file]
            });
          } else {
            const link = document.createElement('a');
            link.download = `hiit-esteira-treino-${Date.now()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
          }
        }, 'image/png');
      } catch (e) {
        console.log('Native share error:', e);
      }
    });
  }

  if (btnCopyText) {
    btnCopyText.addEventListener('click', () => {
      const w = currentShareWorkout || {};
      const name = (state.userProfile && state.userProfile.name) ? state.userProfile.name : 'Atleta';
      const txt = `🏃 HIIT NA ESTEIRA - TREINO CONCLUÍDO! ⚡\nAtleta: ${name}\nNível: ${w.preset || 'Iniciante'}\n⏱️ Tempo: ${formatTime(w.durationSec || 0)}\n📏 Distância: ${w.distanceKm ? w.distanceKm.toFixed(2) : '0.00'} km\n⚡ Pace Médio: ${w.avgPaceStr || '--'}\n🔥 Calorias: ~${w.calories || 0} kcal\n\nTreine também com o HIIT Esteira App!`;
      
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(() => {
          btnCopyText.textContent = '✅ TEXTO COPIADO!';
          setTimeout(() => { btnCopyText.textContent = '📋 COPIAR TEXTO DO TREINO'; }, 2000);
        });
      }
    });
  }

  const btnOpenProfile = document.getElementById('btnOpenProfile');
  const btnCloseProfile = document.getElementById('btnCloseProfile');
  const menuItemProfile = document.getElementById('menuItemProfile');
  const formProfile = document.getElementById('formProfile');

  if (btnOpenProfile) {
    btnOpenProfile.addEventListener('click', () => {
      updateProfileUI();
      if (modalProfile) modalProfile.classList.add('active');
    });
  }

  if (menuItemProfile) {
    menuItemProfile.addEventListener('click', () => {
      if (dropdownMenu) dropdownMenu.classList.remove('active');
      updateProfileUI();
      if (modalProfile) modalProfile.classList.add('active');
    });
  }

  if (btnCloseProfile) {
    btnCloseProfile.addEventListener('click', () => {
      if (modalProfile) modalProfile.classList.remove('active');
    });
  }

  // Avatar Options Selector
  document.querySelectorAll('.avatar-opt-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const selectedAvatar = btn.dataset.avatar || '🏃';
      saveUserProfile({ avatar: selectedAvatar });
    });
  });

  // Profile Form Submit
  if (formProfile) {
    formProfile.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('inputProfileName').value || 'Atleta';
      const weightKg = parseFloat(document.getElementById('inputProfileWeight').value) || 70;
      const heightCm = parseFloat(document.getElementById('inputProfileHeight').value) || 175;
      const age = parseInt(document.getElementById('inputProfileAge').value, 10) || 30;
      const gender = document.getElementById('selectProfileGender').value || 'masculino';

      saveUserProfile({ name, weightKg, heightCm, age, gender });
      if (modalProfile) modalProfile.classList.remove('active');
    });
  }

  // Onboarding Carousel Handling
  let onboardingStep = 1;
  const btnNextOnboard = document.getElementById('btnNextOnboarding');
  if (btnNextOnboard) {
    btnNextOnboard.addEventListener('click', () => {
      onboardingStep++;
      const s1 = document.getElementById('onboardSlide1');
      const s2 = document.getElementById('onboardSlide2');
      const s3 = document.getElementById('onboardSlide3');
      const d1 = document.getElementById('dot1');
      const d2 = document.getElementById('dot2');
      const d3 = document.getElementById('dot3');

      if (onboardingStep === 2) {
        if (s1) s1.style.display = 'none';
        if (s2) s2.style.display = 'flex';
        if (d1) d1.className = 'dot-step w-2.5 h-2.5 rounded-full bg-slate-300 transition-all';
        if (d2) d2.className = 'dot-step w-3 h-3 rounded-full bg-slate-900 transition-all';
      } else if (onboardingStep === 3) {
        if (s2) s2.style.display = 'none';
        if (s3) s3.style.display = 'flex';
        btnNextOnboard.textContent = 'CONFIGURAR PERFIL ➔';
        if (d2) d2.className = 'dot-step w-2.5 h-2.5 rounded-full bg-slate-300 transition-all';
        if (d3) d3.className = 'dot-step w-3 h-3 rounded-full bg-slate-900 transition-all';
      } else {
        localStorage.setItem('hiit_onboarded', 'true');
        const modalOnboard = document.getElementById('modalOnboarding');
        if (modalOnboard) modalOnboard.classList.remove('active');
        updateProfileUI();
        if (modalProfile) modalProfile.classList.add('active');
      }
    });
  }

  // Check Onboarding & Splash Screen
  setTimeout(() => {
    const splash = document.getElementById('splashScreen');
    if (splash) {
      splash.style.opacity = '0';
      setTimeout(() => {
        splash.style.display = 'none';
        const onboarded = localStorage.getItem('hiit_onboarded');
        if (!onboarded) {
          const modalOnboard = document.getElementById('modalOnboarding');
          if (modalOnboard) modalOnboard.classList.add('active');
        }
      }, 500);
    }
  }, 1200);

  updateProfileUI();

  // Render Dashboard Metrics & Sparkline
  updateDashboardMetrics();

  // Register PWA Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.log('SW Registration failed:', err);
    });
  }
}

function updateNavTabs(activeTabId) {
  document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
  const target = document.getElementById(activeTabId);
  if (target) target.classList.add('active');
}

// Render Hero Sparkline Curve & Update Dashboard Metrics
function updateDashboardMetrics() {
  const history = state.workoutHistory;
  
  let totalDistKm = 0;
  let totalCalories = 0;
  let totalSecs = 0;

  history.forEach(h => {
    totalDistKm += (h.distanceKm || 0);
    totalCalories += (h.calories || 0);
    totalSecs += (h.durationSec || 0);
  });

  const heroDistEl = document.getElementById('heroDistance');
  const heroCalEl = document.getElementById('heroCalories');
  
  if (heroDistEl) {
    heroDistEl.textContent = totalDistKm > 0 ? `${totalDistKm.toFixed(2).replace('.', ',')} KM` : '8,31 KM';
  }
  if (heroCalEl) {
    heroCalEl.textContent = totalCalories > 0 ? `${totalCalories} Calorias` : '313 Calorias';
  }

  // Dark Record Card Stats
  const darkWorkoutsEl = document.getElementById('darkStatWorkouts');
  const darkTimeEl = document.getElementById('darkStatTime');
  const darkDistEl = document.getElementById('darkStatDistance');

  if (darkWorkoutsEl) darkWorkoutsEl.textContent = history.length > 0 ? history.length : '0';
  if (darkTimeEl) {
    const mins = Math.round(totalSecs / 60);
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60);
      const remMins = mins % 60;
      darkTimeEl.textContent = `${hrs}h ${remMins}m`;
    } else {
      darkTimeEl.textContent = `${mins}m`;
    }
  }
  if (darkDistEl) darkDistEl.textContent = `${totalDistKm.toFixed(1)} KM`;

  // Draw Hero Sparkline Curve
  const canvas = document.getElementById('heroSparklineCanvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    let dataPoints = [20, 35, 25, 45, 30, 60, 40];
    if (history.length > 0) {
      const recent = history.slice(0, 7).reverse();
      dataPoints = recent.map(r => Math.max(15, (r.distanceKm || 2) * 12));
      while (dataPoints.length < 5) dataPoints.unshift(20);
    }

    ctx.save();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(59, 130, 246, 0.35)');
    grad.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

    ctx.beginPath();
    const stepX = w / (dataPoints.length - 1);
    ctx.moveTo(0, h - dataPoints[0]);

    for (let i = 1; i < dataPoints.length; i++) {
      const prevX = (i - 1) * stepX;
      const prevY = h - dataPoints[i - 1];
      const currX = i * stepX;
      const currY = h - dataPoints[i];
      const cpX1 = prevX + stepX / 2;
      const cpY1 = prevY;
      const cpX2 = prevX + stepX / 2;
      const cpY2 = currY;
      ctx.bezierCurveTo(cpX1, cpY1, cpX2, cpY2, currX, currY);
    }

    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, h - dataPoints[0]);
    for (let i = 1; i < dataPoints.length; i++) {
      const prevX = (i - 1) * stepX;
      const prevY = h - dataPoints[i - 1];
      const currX = i * stepX;
      const currY = h - dataPoints[i];
      const cpX1 = prevX + stepX / 2;
      const cpY1 = prevY;
      const cpX2 = prevX + stepX / 2;
      const cpY2 = currY;
      ctx.bezierCurveTo(cpX1, cpY1, cpX2, cpY2, currX, currY);
    }
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }
}

// Make handleShareItemIndex accessible globally for inline onclick
window.handleShareItemIndex = handleShareItemIndex;

// Run on DOM Content Loaded
document.addEventListener('DOMContentLoaded', initApp);

