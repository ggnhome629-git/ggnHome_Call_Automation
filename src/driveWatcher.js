const {
  listFiles,
  downloadFile,
  isAudioFile
} = require('./drive');

const processAudio = require('./processor');

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

module.exports = watchDrive;