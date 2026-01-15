import sys
from faster_whisper import WhisperModel

audio_path = sys.argv[1]

model = WhisperModel(
    "tiny",
    device="cpu",
    compute_type="int8"
)

segments, info = model.transcribe(audio_path)

text = " ".join(segment.text for segment in segments)
print(text.strip())