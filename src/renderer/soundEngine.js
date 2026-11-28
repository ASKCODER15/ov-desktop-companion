/**
 * OV Retro-Tech Synthesized Telemetry Audio & Tactile Mechanical Key Engine
 * Zero robotic TTS voice speech on events; pure analog WebAudio synth motifs & button transients.
 */
(function () {
  let audioCtx = null;
  let bgmInterval = null;
  let bgmPlaying = false;
  let currentBgmChar = 'spidey';

  function getCtx() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function playNote(ctx, freq, startOffset, dur, opts = {}) {
    const t0 = ctx.currentTime + startOffset;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = opts.wave || 'triangle';
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + dur);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(opts.cutoff || 1800, t0);

    const vol = opts.vol || 0.06;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + (opts.attack || 0.018));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  // Tactile mechanical key press micro-sound
  function playUiClick(kind = 'tap') {
    const ctx = getCtx();
    if (!ctx) return;
    if (kind === 'toggle') {
      playNote(ctx, 620, 0, 0.035, { wave: 'triangle', slideTo: 940, cutoff: 2400, vol: 0.04, attack: 0.003 });
    } else if (kind === 'action') {
      playNote(ctx, 523.25, 0, 0.055, { wave: 'triangle', cutoff: 2200, vol: 0.045, attack: 0.004 });
      playNote(ctx, 783.99, 0.035, 0.075, { wave: 'sine', cutoff: 2600, vol: 0.045, attack: 0.004 });
    } else {
      playNote(ctx, 840, 0, 0.024, { wave: 'triangle', slideTo: 310, cutoff: 2000, vol: 0.036, attack: 0.002 });
    }
  }

  // Human-Feel Neural Audio Playback (plays edge-tts neural MP3 data URL or natural WebSpeech fallback)
  let activeVoiceAudio = null;
  let speakingUntil = 0;
  let voicePaused = false;

  function isSpeaking() {
    if (voicePaused) return false;
    if (activeVoiceAudio && !activeVoiceAudio.paused && !activeVoiceAudio.ended) return true;
    if (window.speechSynthesis && window.speechSynthesis.speaking && !window.speechSynthesis.paused) return true;
    return Date.now() < speakingUntil;
  }

  function stopSpeaking() {
    speakingUntil = 0;
    voicePaused = false;
    if (activeVoiceAudio) {
      try {
        activeVoiceAudio.pause();
        activeVoiceAudio.currentTime = 0;
      } catch {}
      activeVoiceAudio = null;
    }
    if (window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch {}
    }
  }

  function togglePauseVoice(forceState = null) {
    const nextPaused = typeof forceState === 'boolean' ? forceState : !voicePaused;
    voicePaused = nextPaused;
    if (activeVoiceAudio) {
      try {
        if (nextPaused) {
          activeVoiceAudio.pause();
          speakingUntil = 0;
        } else if (!activeVoiceAudio.ended) {
          const remMs = Math.max(1500, ((activeVoiceAudio.duration || 6) - (activeVoiceAudio.currentTime || 0)) * 1000);
          speakingUntil = Date.now() + remMs;
          activeVoiceAudio.play().catch(() => {});
        }
      } catch {}
    }
    if (window.speechSynthesis && window.speechSynthesis.speaking) {
      try {
        if (nextPaused) window.speechSynthesis.pause();
        else window.speechSynthesis.resume();
      } catch {}
    }
    return voicePaused;
  }

  function speak(text, character = 'kronos', enabled = true, audioDataUrl = null) {
    if (!enabled) return;
    stopSpeaking();
    voicePaused = false;
    const wordCount = String(text || '').trim().split(/\s+/).filter(Boolean).length;
    speakingUntil = Date.now() + Math.max(2200, Math.min(14000, wordCount * 360));
    if (audioDataUrl) {
      try {
        const audio = new Audio(audioDataUrl);
        audio.volume = 0.94;
        activeVoiceAudio = audio;
        audio.onended = () => {
          if (activeVoiceAudio === audio) activeVoiceAudio = null;
          speakingUntil = 0;
        };
        audio.play().catch(() => {});
        return;
      } catch {}
    }
    const clean = String(text || '').trim();
    if (!clean || !window.speechSynthesis) return;
    try {
      const u = new SpeechSynthesisUtterance(clean);
      const voices = window.speechSynthesis.getVoices() || [];
      const natural = voices.find((v) => /Natural|Online|Neural|Neerja|Swara|Aria|Andrew/i.test(v.name)) || voices[0];
      if (natural) u.voice = natural;
      u.rate = 1.05;
      u.pitch = character === 'kronos' ? 0.94 : 1.03;
      u.onend = () => { speakingUntil = 0; };
      window.speechSynthesis.speak(u);
    } catch {}
  }

  // Original synthesized signature musical & telemetry motifs per unit
  function playCharacterMotif(character = 'spidey', volScale = 1.0) {
    const ctx = getCtx();
    if (!ctx) return;

    if (character === 'nemo') {
      const notes = [523.25, 659.25, 783.99, 987.77, 1046.5, 783.99];
      notes.forEach((f, i) => playNote(ctx, f, i * 0.14, 0.55, { wave: 'sine', cutoff: 2400, vol: 0.045 * volScale }));
    } else if (character === 'spidey') {
      const bass = [130.81, 155.56, 174.61, 196.0];
      bass.forEach((f, i) => playNote(ctx, f, i * 0.18, 0.28, { wave: 'triangle', cutoff: 960, vol: 0.065 * volScale }));
    } else if (character === 'ironman') {
      const riff = [164.81, 196.0, 220.0, 246.94, 220.0];
      riff.forEach((f, i) => playNote(ctx, f, i * 0.15, 0.22, { wave: 'sawtooth', cutoff: 1280, vol: 0.044 * volScale, attack: 0.008 }));
    } else if (character === 'batman') {
      [98.0, 116.54, 146.83, 196.0].forEach((f, i) => {
        playNote(ctx, f, i * 0.14, 0.95, { wave: 'sawtooth', cutoff: 640, vol: 0.038 * volScale, attack: 0.08 });
      });
    } else if (character === 'kronos') {
      // Heavy Monolith Industrial Analog Telemetry Pulse
      [110.0, 146.83, 220.0, 293.66].forEach((f, i) => {
        playNote(ctx, f, i * 0.14, 0.42, { wave: 'sawtooth', cutoff: 880, vol: 0.052 * volScale, attack: 0.006 });
      });
    } else if (character === 'optix') {
      // Expressive Rover Optical Scanner Bleep-Arpeggio
      [783.99, 987.77, 1174.66, 880.0, 1318.51].forEach((f, i) => {
        playNote(ctx, f, i * 0.09, 0.18, { wave: 'sine', cutoff: 3200, vol: 0.048 * volScale, attack: 0.005 });
      });
    } else if (character === 'orbit') {
      // Zero-G Synth Harmonic Triad
      [329.63, 440.0, 554.37, 659.25].forEach((f, i) => {
        playNote(ctx, f, i * 0.11, 0.72, { wave: 'triangle', cutoff: 2000, vol: 0.044 * volScale, attack: 0.03 });
      });
    } else {
      [220.0, 329.63, 440.0, 659.25].forEach((f, i) => {
        playNote(ctx, f, i * 0.08, 0.85, { wave: 'sine', cutoff: 2200, vol: 0.038 * volScale, attack: 0.05 });
      });
    }
  }

  function startBgmLoop(character = 'spidey') {
    stopBgmLoop();
    currentBgmChar = character;
    bgmPlaying = true;
    playCharacterMotif(character, 0.75);
    bgmInterval = setInterval(() => {
      if (bgmPlaying) playCharacterMotif(currentBgmChar, 0.58);
    }, 2600);
  }

  function stopBgmLoop() {
    bgmPlaying = false;
    if (bgmInterval) {
      clearInterval(bgmInterval);
      bgmInterval = null;
    }
  }

  function playStretchBoing() {
    const ctx = getCtx();
    if (!ctx) return;
    playNote(ctx, 220, 0, 0.22, { wave: 'sine', slideTo: 540, cutoff: 1800, vol: 0.052 });
  }

  window.auraSound = {
    speak,
    stopSpeaking,
    togglePauseVoice,
    isVoicePaused: () => voicePaused,
    isSpeaking,
    playUiClick,
    playCharacterMotif,
    startBgmLoop,
    stopBgmLoop,
    playStretchBoing,
    isBgmPlaying: () => bgmPlaying,
  };
})();
