const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const audioFile = process.argv[2];

if (!audioFile) {
  console.error("Usage:");
  console.error("  node transcribe.js <audio-file>");
  process.exit(1);
}

if (!fs.existsSync(audioFile)) {
  console.error(`Audio file not found: ${audioFile}`);
  process.exit(1);
}

// ------------------------------------
// Configuration
// ------------------------------------

const WHISPER = path.resolve("./build/bin/whisper-cli");

const MODEL = path.resolve("./models/ggml-base.en.bin");

const OUTPUT_DIR = path.resolve("./output");

fs.mkdirSync(OUTPUT_DIR, {
  recursive: true,
});

const audioPath = path.resolve(audioFile);

const baseName = path.basename(audioFile, path.extname(audioFile));

const outputJson = path.join(OUTPUT_DIR, `${baseName}.json`);

// ------------------------------------
// Validate
// ------------------------------------

if (!fs.existsSync(WHISPER)) {
  console.error(`whisper-cli not found:\n${WHISPER}`);

  process.exit(1);
}

if (!fs.existsSync(MODEL)) {
  console.error(`Whisper model not found:\n${MODEL}`);

  process.exit(1);
}

// ------------------------------------
// Run whisper.cpp
// ------------------------------------

const args = [
  "-m",
  MODEL,

  "-f",
  audioPath,

  // English
  "-l",
  "en",

  // JSON
  "-oj",

  // More detailed JSON
  "-ojf",

  // Word timestamps
  "-owts",

  // Split at words
  "-sow",

  // Output filename
  "-of",
  path.join(OUTPUT_DIR, baseName),

  // Don't print unnecessary logs
  "-np",
];

console.log("\nTranscribing...");
console.log(`Audio : ${audioPath}`);
console.log(`Model : ${MODEL}`);
console.log();

const whisper = spawn(WHISPER, args, {
  stdio: ["ignore", "pipe", "pipe"],
});

whisper.stdout.on("data", (data) => {
  process.stdout.write(data.toString());
});

whisper.stderr.on("data", (data) => {
  process.stdout.write(data.toString());
});

whisper.on("error", (error) => {
  console.error("\nFailed to start whisper:");
  console.error(error);
});

whisper.on("close", (code) => {
  if (code !== 0) {
    console.error(`\nWhisper exited with code ${code}`);

    process.exit(code);
  }

  console.log("\n\nTranscription completed.");

  const generatedJson = path.join(OUTPUT_DIR, `${baseName}.json`);

  if (!fs.existsSync(generatedJson)) {
    console.error(`JSON output not found:\n${generatedJson}`);

    process.exit(1);
  }

  console.log(`JSON: ${generatedJson}`);

  processJson(generatedJson);
});

// ------------------------------------
// Normalize Whisper JSON
// ------------------------------------

function processJson(file) {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));

  const words = [];

  const segments = raw.transcription || [];

  for (const segment of segments) {
    const text = segment.text?.trim() || "";

    const start = timestampToSeconds(segment.timestamps?.from);

    const end = timestampToSeconds(segment.timestamps?.to);

    words.push({
      text,
      start,
      end,
    });
  }

  const result = {
    audio: audioFile,

    language: raw.result?.language || "en",

    segments: words,
  };

  const normalizedPath = path.join(OUTPUT_DIR, `${baseName}.transcript.json`);

  fs.writeFileSync(normalizedPath, JSON.stringify(result, null, 2));

  console.log(`Transcript: ${normalizedPath}`);

  console.log("\nPreview:");

  for (const item of words.slice(0, 10)) {
    console.log(
      `[${formatTime(item.start)} -> ${formatTime(item.end)}] ${item.text}`,
    );
  }
}

// ------------------------------------
// Helpers
// ------------------------------------

function timestampToSeconds(value) {
  if (!value) {
    return 0;
  }

  // Example:
  // 00:00:12,340

  const match = value.match(/(\d+):(\d+):(\d+)[,.](\d+)/);

  if (!match) {
    return 0;
  }

  const hours = Number(match[1]);

  const minutes = Number(match[2]);

  const seconds = Number(match[3]);

  const milliseconds = Number(match[4].padEnd(3, "0"));

  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);

  const secs = (seconds % 60).toFixed(3);

  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(6, "0")}`;
}
