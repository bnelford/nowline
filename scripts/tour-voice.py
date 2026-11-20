# Regenerates the tour voiceover (assets/tour/01.mp3 … 13.mp3) from TOUR[].say in src/app.js.
# Kokoro-82M, voice af_heart, through the kokoro-onnx runtime; see THIRD_PARTY.md. Not part of the site
# or the tests, so it isn't in package.json. Needs Python 3.10–3.12 and ffmpeg:
#   uv venv -p 3.12 .tts && uv pip install -p .tts/bin/python kokoro-onnx soundfile
#   curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
#   curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
#   .tts/bin/python scripts/tour-voice.py <folder with the two model files> [step numbers, e.g. 1 13]
import ast, os, re, subprocess, sys, tempfile
import soundfile as sf
from kokoro_onnx import Kokoro

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(root, 'src/app.js'), encoding='utf-8').read()
tour = src[src.index('const TOUR=['):]
lines = [ast.literal_eval(m) for m in re.findall(r'''say:("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')''', tour)][:13]
models, only = sys.argv[1], {int(a) for a in sys.argv[2:]}
k = Kokoro(os.path.join(models, 'kokoro-v1.0.onnx'), os.path.join(models, 'voices-v1.0.bin'))
with tempfile.TemporaryDirectory() as tmp:
    for i, line in enumerate(lines, 1):
        if only and i not in only: continue
        samples, sr = k.create(line, voice='af_heart', speed=1.0, lang='en-us')
        wav, mp3 = os.path.join(tmp, f'{i:02d}.wav'), os.path.join(root, f'assets/tour/{i:02d}.mp3')
        sf.write(wav, samples, sr)
        # 24 kHz mono, 40 kbps: small, and what the tour expects
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', wav, '-ac', '1', '-ar', '24000',
                        '-codec:a', 'libmp3lame', '-b:a', '40k', mp3], check=True)
        print(f'{i:02d}  {len(samples) / sr:4.1f}s  {line}')
