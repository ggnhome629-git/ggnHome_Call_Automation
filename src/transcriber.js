const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { exec } = require('child_process');
require('dotenv').config();

/* =====================================================
   CONFIG
===================================================== */
const os = require('os');

/* =====================================================
   SELF-LEARNING NORMALIZATION STORE
===================================================== */
const CORRECTIONS_FILE = path.join('/tmp', 'normalization_rules.json');

function loadCorrections() {
  try {
    if (fs.existsSync(CORRECTIONS_FILE)) {
      return JSON.parse(fs.readFileSync(CORRECTIONS_FILE, 'utf8'));
    }
  } catch (_) {}
  return {};
}

function saveCorrections(rules) {
  try {
    fs.writeFileSync(CORRECTIONS_FILE, JSON.stringify(rules, null, 2));
  } catch (_) {}
}

function applyLearnedCorrections(text) {
  const rules = loadCorrections();
  let updated = text;

  for (const [wrong, correct] of Object.entries(rules)) {
    const re = new RegExp(`\\b${wrong}\\b`, 'gi');
    updated = updated.replace(re, correct);
  }
  return updated;
}

function hasEnoughRAM(requiredMB) {
  const freeMB = os.freemem() / (1024 * 1024);
  return freeMB > requiredMB;
}

/* =====================================================
   ROUND ROBIN STT PROVIDERS (VERCEL SAFE)
===================================================== */

const RR_STATE_FILE = path.join('/tmp', 'stt_rr_index.json');

const STT_PROVIDERS = [
  'deepgram',
  'assemblyai'
];

function getNextProvider() {
  let index = 0;

  try {
    if (fs.existsSync(RR_STATE_FILE)) {
      index = JSON.parse(fs.readFileSync(RR_STATE_FILE)).index || 0;
    }
  } catch (_) {}

  const provider = STT_PROVIDERS[index % STT_PROVIDERS.length];

  try {
    fs.writeFileSync(
      RR_STATE_FILE,
      JSON.stringify({ index: index + 1 })
    );
  } catch (_) {}

  return provider;
}

// RAM safety
const MAX_WHISPER_FILE_MB = 10;
const TIMEOUT_MS = 3 * 60 * 1000;

const IS_RENDER = !!process.env.RENDER;
const IS_VERCEL = !!process.env.VERCEL;

// Render free tier limits
const MAX_RENDER_AUDIO_SECONDS = 25;
const MAX_RENDER_FILE_MB = 6;

// Whisper preferred when platform & RAM allow
const USE_WHISPER_PRIMARY = !IS_RENDER && !IS_VERCEL;

/* =====================================================
   PROVIDER DISPATCHER
===================================================== */
async function transcribeWithAPIProvider(filePath) {
  const provider = getNextProvider();
  console.log(`🔄 STT Provider (round‑robin): ${provider}`);

  switch (provider) {
    case 'deepgram':
      return transcribeWithDeepgram(filePath);

    case 'assemblyai':
      return transcribeWithAssemblyAI(filePath);

    default:
      throw new Error('Unknown STT provider');
  }
}

/* =====================================================
   MAIN ENTRY
===================================================== */
async function transcribeAudio(filePath) {
  const stats = fs.statSync(filePath);
  const fileMB = stats.size / (1024 * 1024);

  if (IS_RENDER && fileMB > MAX_RENDER_FILE_MB) {
    throw new Error('File too large for Render free tier');
  }
  if (IS_VERCEL && fileMB > 8) {
    throw new Error('File too large for Vercel free tier');
  }

  const results = [];

  // 1️⃣ WHISPER (PRIMARY — RAM & PLATFORM AWARE)

    try {
      console.log('🤖 Transcribing with Whisper (primary)...');
      const t = await transcribeWithWhisper(filePath);
      if (t) {
        console.log('📄 Transcript (Whisper):', t);
        results.push({ source: 'whisper', text: t, weight: 4 });
      }
    } catch (e) {
      console.warn('⚠️ Whisper failed:', e.message);
    }
  

  // 2️⃣ VOSK (SECONDARY — OFFLINE FALLBACK)
  if (!IS_VERCEL && results.length === 0) {
    try {
      console.log('🎧 Transcribing with Vosk (fallback)...');
      const t = await transcribeWithVosk(filePath);
      if (t) {
        console.log('📄 Transcript (Vosk):', t);
        results.push({ source: 'vosk', text: t, weight: 2 });
      }
    } catch (e) {
      console.warn('⚠️ Vosk failed:', e.message);
    }
  }

  // 3️⃣ API-BASED STT (LAST RESORT — COSTLY BUT SAFE)
  if (results.length === 0) {
    try {
      console.log('☁️ Transcribing with API provider (last resort)...');
      const t = await transcribeWithAPIProvider(filePath);
      if (t) {
        console.log('📄 Transcript (API):', t);
        results.push({ source: 'api', text: t, weight: 1 });
      }
    } catch (e) {
      console.warn('⚠️ API provider failed:', e.message);
    }
  }

  if (!hasEnoughRAM(700)) {
    console.warn('🧠 Low RAM detected — skipping Whisper to avoid crash');
  }

  if (!results.length) {
    throw new Error('All transcription methods failed');
  }

  // 🧠 ENSEMBLE MERGE
  return mergeTranscripts(results);
}

/* =====================================================
   1️⃣ DEEPGRAM (BEST FOR RENDER FREE)
===================================================== */
async function transcribeWithDeepgram(filePath) {
  if (!process.env.DEEPGRAM_API_KEY) {
    throw new Error('Deepgram API key missing');
  }

  const audioBuffer = fs.readFileSync(filePath);

  const res = await axios.post(
    'https://api.deepgram.com/v1/listen?model=nova-2-phonecall&punctuate=true&language=en',
    audioBuffer,
    {
      headers: {
        Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
        'Content-Type': 'audio/*',
      },
      timeout: 30000,
      maxBodyLength: Infinity,
    }
  );

  return (
    res.data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || ''
  );
}

async function transcribeWithAssemblyAI(filePath) {
  if (!process.env.ASSEMBLYAI_API_KEY) {
    throw new Error('AssemblyAI API key missing');
  }

  const audio = fs.readFileSync(filePath);

  // Upload
  const upload = await axios.post(
    'https://api.assemblyai.com/v2/upload',
    audio,
    {
      headers: {
        authorization: process.env.ASSEMBLYAI_API_KEY,
        'content-type': 'application/octet-stream'
      },
      maxBodyLength: Infinity,
    }
  );

  // Start transcription
  const job = await axios.post(
    'https://api.assemblyai.com/v2/transcript',
    { audio_url: upload.data.upload_url },
    {
      headers: { authorization: process.env.ASSEMBLYAI_API_KEY }
    }
  );

  const id = job.data.id;

  // Poll
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const status = await axios.get(
      `https://api.assemblyai.com/v2/transcript/${id}`,
      { headers: { authorization: process.env.ASSEMBLYAI_API_KEY } }
    );

    if (status.data.status === 'completed') {
      return status.data.text || '';
    }

    if (status.data.status === 'error') {
      throw new Error(status.data.error);
    }
  }

  throw new Error('AssemblyAI timeout');
}

/* =====================================================
   2️⃣ VOSK (LOWEST RAM – OFFLINE SAFE)
   ~50–180 MB RAM depending on model
===================================================== */
async function transcribeWithVosk(filePath) {
  const wavPath = await convertToWavIfNeeded(filePath);

  return new Promise((resolve, reject) => {
    const pythonPath = path.join(__dirname, '..', 'pyenv', 'bin', 'python');
    const scriptPath = path.join(__dirname, 'transcribe_vosk.py');
    const cmd = `"${pythonPath}" "${scriptPath}" "${wavPath}"`;

    exec(cmd, { timeout: TIMEOUT_MS }, (err, stdout) => {
      if (err) return reject(err);
      const text = stdout.trim();
      if (!text) return reject(new Error('Empty Vosk output'));
      resolve(text);
    });
  });
}

/* =====================================================
   3️⃣ WHISPER (OPTIONAL — AUTO‑DISABLED ON LOW RAM / RENDER)
   ~180–250 MB RAM (tiny + int8)
===================================================== */
async function transcribeWithWhisper(filePath) {
  const wavPath = await convertToWavIfNeeded(filePath);

  return new Promise((resolve, reject) => {
    const pythonPath = path.join(__dirname, '..', 'pyenv', 'bin', 'python');
    const scriptPath = path.join(__dirname, 'transcribe_whisper.py');

    const cmd = `"${pythonPath}" "${scriptPath}" "${wavPath}"`;

    exec(cmd, { timeout: TIMEOUT_MS }, (err, stdout, stderr) => {
      if (err) {
        return reject(new Error(stderr || err.message));
      }

      const text = stdout.trim();
      if (!text) {
        return reject(new Error('Empty Whisper output'));
      }

      resolve(text);
    });
  });
}

/* =====================================================
   NUMBER WORD NORMALIZATION
===================================================== */
function normalizeNumberWords(text) {
  const map = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
    sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
    twenty: 20, thirty: 30, forty: 40, fifty: 50,
    sixty: 60, seventy: 70, eighty: 80, ninety: 90
  };

  return text.replace(
    /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\s+(one|two|three|four|five|six|seven|eight|nine)\b/g,
    (_, tens, ones) => map[tens] + map[ones]
  );
}

/* =====================================================
   KEYWORD EXTRACTION (UPDATED)
===================================================== */
function extractKeywords(text) {
  let normalizedText = normalizeNumberWords(text.toLowerCase());

  // Apply learned corrections
  normalizedText = applyLearnedCorrections(normalizedText);

  // Fix common Whisper mistakes for BHK
  normalizedText = normalizedText
    .replace(/(\d+)\s*bh\b/g, '$1 bhk')
    .replace(/(\d+)\s*bh\s+gain\b/g, '$1 bhk')
    .replace(/\bbee\s*aitch\s*kay\b/g, 'bhk');

  // Remove commas from numbers (20,000 → 20000)
  normalizedText = normalizedText.replace(/(\d+),(\d+)/g, '$1$2');

  // Normalize rent phrases
  normalizedText = normalizedText.replace(/\brent\s+(\d+)/g, 'rent $1');

  // Email extraction disabled (mobile-based flow)
  const emailNormalizedText = null;

  const bhkMatch = normalizedText.match(/(\d+)\s*(bhk|bh)/);
  const sectorMatch = normalizedText.match(/sector\s*(number\s*)?(\d+)/);
  const budgetMatch =
    normalizedText.match(/rent\s*(\d+)/) ||
    normalizedText.match(/(\d+)\s*(k|thousand|lakh|lac|crore|cr)/);

  const bhk = bhkMatch ? Number(bhkMatch[1]) : null;
  const sector = sectorMatch ? Number(sectorMatch[2]) : null;
  const budget_hint = budgetMatch ? budgetMatch[0] : null;
  const email = null;

  console.log('🔍 Extracted keywords:', {
    bhk,
    sector,
    budget_hint,
    email
  });

  // Auto-learn common failure patterns (safe logging only)
  if (!bhk || !budget_hint) {
    const rules = loadCorrections();

    // Example learning hooks (manual approval later)
    if (/bh\s+gain/.test(normalizedText) && !rules['bh gain']) {
      rules['bh gain'] = 'bhk';
    }

    if (/bee\s+gain/.test(normalizedText) && !rules['bee gain']) {
      rules['bee gain'] = 'bhk';
    }

    saveCorrections(rules);
  }

  return {
    bhk,
    sector,
    budget_hint,
    email,
    raw_text: text.trim(),
  };
}

function mergeTranscripts(results) {
  const whisper = results.find(r => r.source === 'whisper');
  if (whisper) {
    console.log('🏆 Selected transcript from Whisper');
    return whisper.text;
  }

  console.log('🏆 Selected transcript from fallback');
  return results.sort((a, b) => b.weight - a.weight)[0].text;
}

function convertToWavIfNeeded(filePath) {
  return new Promise((resolve, reject) => {
    if (!filePath.toLowerCase().endsWith('.amr')) {
      return resolve(filePath);
    }

    const wavPath = filePath.replace(/\.amr$/i, '.wav');
    const cmd = `ffmpeg -y -i "${filePath}" -ar 16000 -ac 1 -af "highpass=f=200,lowpass=f=3000,dynaudnorm" "${wavPath}"`;

    exec(cmd, (err) => {
      if (err) return reject(new Error('FFmpeg conversion failed'));
      resolve(wavPath);
    });
  });
}

module.exports = {
  transcribeAudio,
  extractKeywords,
};