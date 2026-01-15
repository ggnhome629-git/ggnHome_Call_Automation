

const express = require("express");
const mongoose = require("mongoose");
require("dotenv").config();

const watchDrive = require("./src/driveWatcher");

const app = express();
const PORT = process.env.PORT || 3000;

// Health check route required by Render
app.get("/", (req, res) => {
  res.status(200).send("GGN Home Call Automation is running");
});

async function start() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB Connected");

    // Start Google Drive watcher
    watchDrive();
    console.log("👀 Watching Google Drive for new files...");
  } catch (err) {
    console.error("❌ Startup error:", err);
    process.exit(1);
  }
}

// IMPORTANT: bind to process.env.PORT and 0.0.0.0
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Server listening on port ${PORT}`);
  start();
});