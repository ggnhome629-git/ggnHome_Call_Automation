const fs = require('fs');
const path = require('path');

const { listFiles, isAudioFile, downloadFile, isTextFile } = require('./drive');
const { transcribeAudio, extractKeywords } = require('./transcriber');
const {
  connectDB,
  searchRentalProperties,
  sendResultsEmail,
} = require('./db');

async function processAudio(localPath, phoneNumber = null) {
  try {
    if (phoneNumber) {
      console.log("📞 Caller mobile number:", phoneNumber);
    } else {
      console.log("📞 Caller mobile number: not available");
    }
    console.log(`🎙️ Transcribing audio: ${path.basename(localPath)}`);
    const transcript = await transcribeAudio(localPath);

    if (!transcript) {
      console.log('⚠️ Empty transcript, skipping');
      return;
    }

    console.log('🧠 Extracting keywords...');
    const keywords = extractKeywords(transcript);

    console.log('📊 Normalizing data...');
    const normalized = normalizeKeywords(keywords);

    console.log('🔎 Searching database...');
    const results = await searchRentalProperties(normalized);

    console.log(`🏠 Found ${results.length} matching properties`);

    // 4️⃣ Send email if results exist
    if (results.length > 0) {
      await sendResultsEmail(results, null, phoneNumber);
    }

    // 5️⃣ Cleanup local file
    fs.unlinkSync(localPath);
    console.log('🗑️ Local file deleted');

    console.log('-----------------------------');
  } catch (err) {
    console.error('❌ Failed processing audio', err.message);
  }
}

/**
 * NORMALIZATION LOGIC
 */
function normalizeKeywords(keywords) {
  let maxPrice = null;

  if (keywords.budget_hint) {
    const text = keywords.budget_hint.toLowerCase();
    const num = parseInt(text);

    if (text.includes('k')) maxPrice = num * 1000;
    else if (text.includes('lakh') || text.includes('lac')) maxPrice = num * 100000;
    else if (text.includes('crore') || text.includes('cr')) maxPrice = num * 10000000;
  }

  return {
    bhk: keywords.bhk,
    sector: keywords.sector,
    maxPrice,
  };
}

module.exports = processAudio;
