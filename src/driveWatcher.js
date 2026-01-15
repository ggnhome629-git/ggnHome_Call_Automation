const mongoose = require("mongoose");

const {
  listFiles,
  downloadFile,
  isAudioFile
} = require('./drive');

const processAudio = require('./processor');

async function connectDB() {
  if (mongoose.connection.readyState === 1) return;

  await mongoose.connect(process.env.MONGO_URI);

  console.log("✅ MongoDB Connected");
}

async function watchDrive() {
  console.log("👀 Watching Google Drive for new files...");

  while (true) {
    try {
      const files = await listFiles();

      for (const file of files) {
        if (!isAudioFile(file)) continue;

        console.log("⬇️ New file detected:", file.name);

        const localPath = await downloadFile(file);
        await processAudio(localPath, file.extractedPhone);
      }
    } catch (err) {
      console.error("Drive watcher error:", err);
    }

    // ⏱ wait 30 seconds
    await new Promise(r => setTimeout(r, 30_000));
  }
}

(async () => {
  try {
    await connectDB();
    await watchDrive();
  } catch (err) {
    console.error("❌ Failed to start Drive watcher:", err);
    process.exit(1);
  }
})();