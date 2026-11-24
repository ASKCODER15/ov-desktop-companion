/**
 * OV Local Voice (Distinct TTS per Companion) & Offline Polyphonic Theme BGM Engine
 * Zero external servers, zero copyright audio bloat, ultra-low RAM!
 */
(function () {
  let audioCtx = null;
  let bgmInterval = null;
  let bgmPlaying = false;
  let currentBgmChar = 'vesper';

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

  // Distinct Companion Voice Profiles using installed Windows OneCore / SAPI voices!
  const VOICE_PROFILES = {
    vesper: { prefer: ['mark', 'david'], pitch: 1.30, rate: 1.12, greeting: 'Hey! Vesper here — tethered and ready to work!' },
    vector: { prefer: ['mark', 'david'], pitch: 0.90, rate: 1.07, greeting: 'Thrusters online. Vector ready — what are we building?' },
    core:   { prefer: ['george', 'david', 'mark'], pitch: 0.74, rate: 0.92, greeting: 'Core online. All systems nominal.' },
    coral:  { prefer: ['zira', 'kalpana', 'hazel'], pitch: 1.38, rate: 1.08, greeting: 'Hi! Coral is gliding and ready to help!' },
  };

  function pickVoice(preferList) {
    if (!window.speechSynthesis) return null;
    const voices = window.speechSynthesis.getVoices() || [];
    if (!voices.length) return null;
    for (const kw of preferList) {
      const match = voices.find((v) => v.name.toLowerCase().includes(kw));
      if (match) return match;
    }
    return voices.find((v) => /^en/i.test(v.lang)) || voices[0];
  }

  function speak(text, character = 'vesper', enabled = true) {
    if (!enabled || !window.speechSynthesis) return;
    const clean = String(text || '')
      .replace(/[*_`#[\]()]/g, '')
      .replace(/https?:\/\/\S+/g, 'link')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 320);
    if (!clean) return;
    try {
      window.speechSynthesis.cancel();
      const prof = VOICE_PROFILES[character] || VOICE_PROFILES.vesper;
      const utt = new SpeechSynthesisUtterance(clean);
      const voice = pickVoice(prof.prefer);
      if (voice) utt.voice = voice;
      utt.pitch = prof.pitch;
      utt.rate = prof.rate;
      utt.volume = 0.92;
      window.speechSynthesis.speak(utt);
    } catch {}
  }

  function stopSpeaking() {
    try { window.speechSynthesis?.cancel(); } catch {}
  }

  // Warm polyphonic note helper
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
    gain.gain.linearRampToValueAtTime(vol, t0 + (opts.attack || 0.025));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  // Original synthesized signature musical motifs per OV companion!
  function playCharacterMotif(character = 'vesper', volScale = 1.0) {
    const ctx = getCtx();
    if (!ctx) return;

    if (character === 'coral') {
      // Serene sparkling underwater harp arpeggio
      const notes = [523.25, 659.25, 783.99, 987.77, 1046.5, 783.99, 659.25, 587.33];
      notes.forEach((f, i) => playNote(ctx, f, i * 0.16, 0.72, { wave: 'sine', cutoff: 2600, vol: 0.052 * volScale }));
      playNote(ctx, 261.63, 0, 1.5, { wave: 'sine', cutoff: 800, vol: 0.045 * volScale, attack: 0.08 });
    } else if (character === 'vesper') {
      // Chill lo-fi synth chords + snappy groove bass
      const bass = [130.81, 155.56, 174.61, 146.83];
      bass.forEach((f, i) => playNote(ctx, f, i * 0.28, 0.35, { wave: 'triangle', cutoff: 720, vol: 0.08 * volScale }));
      const chords = [
        [261.63, 311.13, 392.0, 466.16],
        [233.08, 293.66, 349.23, 440.0],
      ];
      chords.forEach((ch, ci) => {
        ch.forEach((f) => playNote(ctx, f, ci * 0.56, 0.65, { wave: 'sine', cutoff: 1400, vol: 0.032 * volScale }));
      });
    } else if (character === 'vector') {
      // Driven electronic synthwave aero-riff + turbine swell
      const riff = [164.81, 196.0, 220.0, 220.0, 196.0, 246.94, 220.0];
      const times = [0, 0.18, 0.36, 0.56, 0.74, 0.92, 1.12];
      riff.forEach((f, i) => {
        playNote(ctx, f, times[i], 0.24, { wave: 'sawtooth', cutoff: 1150, vol: 0.048 * volScale, attack: 0.01 });
        playNote(ctx, f * 1.5, times[i], 0.22, { wave: 'triangle', cutoff: 1400, vol: 0.032 * volScale, attack: 0.01 });
      });
    } else if (character === 'core') {
      // Refined holographic AI ambient chord swell + crystalline chime
      [220.0, 329.63, 415.3, 493.88, 659.25].forEach((f, i) => {
        playNote(ctx, f, i * 0.07, 1.45, { wave: 'sine', cutoff: 2400, vol: 0.036 * volScale, attack: 0.12 });
      });
      playNote(ctx, 1318.5, 0.45, 0.65, { wave: 'sine', cutoff: 3200, vol: 0.028 * volScale });
    }
  }

  function startBgmLoop(character = 'vesper') {
    stopBgmLoop();
    currentBgmChar = character;
    bgmPlaying = true;
    playCharacterMotif(character, 0.78);
    const period = character === 'vector' ? 2200 : character === 'vesper' ? 2400 : 2800;
    bgmInterval = setInterval(() => {
      if (bgmPlaying) playCharacterMotif(currentBgmChar, 0.62);
    }, period);
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
    playNote(ctx, 210, 0, 0.24, { wave: 'sine', slideTo: 520, cutoff: 1800, vol: 0.055 });
  }

  if (window.speechSynthesis) {
    try { window.speechSynthesis.getVoices(); } catch {}
  }

  window.auraSound = {
    speak,
    stopSpeaking,
    playCharacterMotif,
    startBgmLoop,
    stopBgmLoop,
    playStretchBoing,
    isBgmLooping: () => bgmPlaying,
    VOICE_PROFILES,
  };
})();
