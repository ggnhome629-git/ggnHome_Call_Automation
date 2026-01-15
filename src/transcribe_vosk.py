import sys
import json
import wave
from vosk import Model, KaldiRecognizer


import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "..", "models", "vosk-model-small-en-us-0.15")

model = Model(MODEL_PATH)

wf = wave.open(sys.argv[1], "rb")
rec = KaldiRecognizer(model, wf.getframerate())
rec.SetWords(True)

result = []

while True:
    data = wf.readframes(4000)
    if len(data) == 0:
        break
    if rec.AcceptWaveform(data):
        result.append(json.loads(rec.Result()).get("text", ""))

result.append(json.loads(rec.FinalResult()).get("text", ""))

print(" ".join(result))