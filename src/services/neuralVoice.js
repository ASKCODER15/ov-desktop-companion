const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { getPrivateDataDir } = require('./security');

const os = require('os');

function buildPythonCandidates() {
  const cands = [];
  if (process.env.OV_PYTHON_BIN) cands.push(process.env.OV_PYTHON_BIN);
  cands.push(path.resolve(__dirname, '..', '..', '.venv', 'Scripts', 'python.exe'));
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const versions = ['Python313', 'Python312', 'Python311', 'Python310'];
  for (const v of versions) {
    cands.push(path.join(localAppData, 'Programs', 'Python', v, 'python.exe'));
    cands.push(`C:\\Program Files\\${v}\\python.exe`);
    cands.push(`C:\\${v}\\python.exe`);
  }
  cands.push('python');
  return cands;
}

function resolvePythonBin() {
  for (const cand of buildPythonCandidates()) {
    if (cand === 'python' || fs.existsSync(cand)) return cand;
  }
  return 'python';
}

/**
 * Single Consistent Named Voice Catalog
 * Whichever named voice the user selects, OV sticks 100% with that exact voice
 * without switching voices randomly between messages or characters!
 */
const VOICE_CATALOG = [
  {
    id: 'arjun',
    name: 'Arjun',
    label: 'Arjun — Warm Indian Male (EN / Hinglish / HI)',
    voice: 'en-IN-PrabhatNeural',
    rate: '+5%',
    pitch: '+0Hz',
  },
  {
    id: 'kavya',
    name: 'Kavya',
    label: 'Kavya — Expressive Indian Female (EN / Hinglish / HI)',
    voice: 'en-IN-NeerjaExpressiveNeural',
    rate: '+5%',
    pitch: '+2Hz',
  },
  {
    id: 'kabir',
    name: 'Kabir',
    label: 'Kabir — Studio Hindi & Hinglish Male',
    voice: 'hi-IN-MadhurNeural',
    rate: '+4%',
    pitch: '+0Hz',
  },
  {
    id: 'meera',
    name: 'Meera',
    label: 'Meera — Studio Hindi & Hinglish Female',
    voice: 'hi-IN-SwaraNeural',
    rate: '+4%',
    pitch: '+2Hz',
  },
  {
    id: 'andrew',
    name: 'Andrew',
    label: 'Andrew — Deep Studio Multilingual Male',
    voice: 'en-US-AndrewMultilingualNeural',
    rate: '+3%',
    pitch: '-1Hz',
  },
  {
    id: 'ava',
    name: 'Ava',
    label: 'Ava — Crisp Studio Multilingual Female',
    voice: 'en-US-AvaMultilingualNeural',
    rate: '+4%',
    pitch: '+1Hz',
  },
  {
    id: 'brian',
    name: 'Brian',
    label: 'Brian — Calm Monolith Baritone Male',
    voice: 'en-US-BrianMultilingualNeural',
    rate: '+0%',
    pitch: '-2Hz',
  },
];

const VALID_VOICE_IDS = new Set(VOICE_CATALOG.map((v) => v.id));

function getVoiceEntry(voiceId) {
  const id = String(voiceId || 'arjun').toLowerCase().trim();
  return VOICE_CATALOG.find((v) => v.id === id) || VOICE_CATALOG[0];
}

function sanitizeForSpeech(rawText) {
  return String(rawText || '')
    .replace(/\[{1,2}\s*ACTION\s*:[\s\S]*?\]{1,2}/gi, '')
    .replace(/```[\s\S]*?```/g, ' code block ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/https?:\/\/\S+/g, 'link')
    .replace(/[*_#~>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 320);
}

// Embedded Python script for 100% Local Open-Source Whisper (faster-whisper + pyaudio) STT
const LOCAL_WHISPER_PY = `
import sys, time
try:
    import pyaudio
    import numpy as np
    from faster_whisper import WhisperModel
except Exception as e:
    print("FALLBACK::" + str(e))
    sys.exit(0)

try:
    pa = pyaudio.PyAudio()
    rate = 16000
    chunk = 1024
    stream = pa.open(format=pyaudio.paInt16, channels=1, rate=rate, input=True, frames_per_buffer=chunk)
    frames = []
    max_seconds = 10.0
    total_chunks = int(rate / chunk * max_seconds)
    speech_started = False
    silent_chunks = 0
    wait_start_chunks = int(rate / chunk * 3.2)
    for i in range(total_chunks):
        data = stream.read(chunk, exception_on_overflow=False)
        arr = np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0
        frames.append(arr)
        rms = float(np.sqrt(np.mean(arr * arr)))
        if rms > 0.012:
            speech_started = True
            silent_chunks = 0
        elif speech_started:
            silent_chunks += 1
            if silent_chunks > int(rate / chunk * 1.35) and i > int(rate / chunk * 1.5):
                break
        elif i > wait_start_chunks:
            break
    stream.stop_stream()
    stream.close()
    pa.terminate()

    audio = np.concatenate(frames, axis=0)
    if float(np.max(np.abs(audio))) < 0.008:
        print("EMPTY::No microphone speech detected")
        sys.exit(0)

    try:
        model = WhisperModel("base", device="cpu", compute_type="int8", local_files_only=True)
    except Exception:
        model = WhisperModel("tiny.en", device="cpu", compute_type="int8", local_files_only=True)

    segments, info = model.transcribe(audio, beam_size=2, vad_filter=True)
    text = " ".join([seg.text.strip() for seg in segments]).strip()
    if text:
        print("OK::WHISPER-BASE::" + text)
    else:
        print("EMPTY::No words recognized")
except Exception as e:
    print("ERR::" + str(e))
`;

class NeuralVoiceService {
  constructor() {
    this.cacheDir = path.join(getPrivateDataDir(), 'tts-cache');
    this.pythonBin = resolvePythonBin();
    try {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    } catch {}
  }

  getVoiceCatalog() {
    return VOICE_CATALOG;
  }

  /**
   * Synthesizes speech using ONLY the single user-selected named voice (e.g. 'arjun', 'kavya', 'kabir', etc.)
   * Never switches voices between messages!
   */
  async synthesize(rawText, selectedVoiceId = 'arjun') {
    const cleanText = sanitizeForSpeech(rawText);
    if (!cleanText) return { ok: false, error: 'Empty text' };

    const profile = getVoiceEntry(selectedVoiceId);
    const voice = profile.voice;
    const hash = crypto
      .createHash('sha1')
      .update(`${voice}|${profile.rate}|${profile.pitch}|${cleanText}`)
      .digest('hex')
      .slice(0, 20);
    const outPath = path.join(this.cacheDir, `tts-${hash}.mp3`);

    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 256) {
      const b64 = fs.readFileSync(outPath).toString('base64');
      return {
        ok: true,
        audioDataUrl: `data:audio/mpeg;base64,${b64}`,
        voice,
        voiceId: profile.id,
        voiceName: profile.name,
        cached: true,
      };
    }

    return new Promise((resolve) => {
      const args = [
        '-m',
        'edge_tts',
        '--voice',
        voice,
        `--rate=${profile.rate}`,
        `--pitch=${profile.pitch}`,
        '--text',
        cleanText,
        '--write-media',
        outPath,
      ];
      execFile(
        this.pythonBin,
        args,
        { timeout: 11000, windowsHide: true },
        (err) => {
          if (err || !fs.existsSync(outPath) || fs.statSync(outPath).size < 256) {
            resolve({
              ok: false,
              text: cleanText,
              voice,
              voiceId: profile.id,
              voiceName: profile.name,
              error: err ? err.message : 'Neural TTS synthesis unavailable',
            });
            return;
          }
          try {
            const b64 = fs.readFileSync(outPath).toString('base64');
            resolve({
              ok: true,
              audioDataUrl: `data:audio/mpeg;base64,${b64}`,
              voice,
              voiceId: profile.id,
              voiceName: profile.name,
              cached: false,
            });
          } catch (readErr) {
            resolve({ ok: false, text: cleanText, voice, voiceId: profile.id, error: readErr.message });
          }
        }
      );
    });
  }

  /**
   * 100% Local Open-Source Whisper STT (faster-whisper base/tiny + PyAudio mic capture),
   * with fallback to Windows System.Speech.Recognition if Python audio is unavailable.
   */
  async listenOnce() {
    const whisperRes = await new Promise((resolve) => {
      execFile(
        this.pythonBin,
        ['-c', LOCAL_WHISPER_PY],
        { timeout: 22000, windowsHide: true },
        (err, stdout) => {
          const out = String(stdout || '').trim();
          if (out.startsWith('OK::WHISPER-BASE::')) {
            resolve({
              ok: true,
              engine: 'faster-whisper-base',
              transcript: out.replace(/^OK::WHISPER-BASE::/, '').trim(),
            });
          } else if (out.startsWith('EMPTY::')) {
            resolve({
              ok: false,
              empty: true,
              engine: 'faster-whisper-base',
              error: 'JARVIS Whisper heard silence — speak right after pressing A+S+D or Mic!',
            });
          } else {
            resolve({ ok: false, fallbackNeeded: true, error: err ? err.message : out });
          }
        }
      );
    });

    if (whisperRes.ok || whisperRes.empty) return whisperRes;

    // Fallback to Windows System.Speech.Recognition if PyAudio mic is busy
    if (process.platform !== 'win32') return whisperRes;
    const psScript = `
      try {
        Add-Type -AssemblyName System.Speech
        $rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine
        $rec.SetInputToDefaultAudioDevice()
        $g = New-Object System.Speech.Recognition.DictationGrammar
        $rec.LoadGrammar($g)
        $res = $rec.Recognize([TimeSpan]::FromSeconds(8))
        $rec.Dispose()
        if ($res -and $res.Text) {
          Write-Output ("OK::" + $res.Text)
        } else {
          Write-Output "EMPTY::No speech detected"
        }
      } catch {
        Write-Output ("ERR::" + $_.Exception.Message)
      }
    `;
    return new Promise((resolve) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
        { timeout: 12000, windowsHide: true },
        (err, stdout) => {
          const out = String(stdout || '').trim();
          if (out.startsWith('OK::')) {
            resolve({ ok: true, engine: 'win-speech', transcript: out.slice(4).trim() });
          } else {
            resolve({
              ok: false,
              empty: true,
              error: 'No speech detected — speak into your mic after pressing A+S+D or Mic!',
            });
          }
        }
      );
    });
  }
}

module.exports = {
  NeuralVoiceService,
  VOICE_CATALOG,
  VALID_VOICE_IDS,
  getVoiceEntry,
  sanitizeForSpeech,
};
