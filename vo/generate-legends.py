"""Generate legend sprites with Gemini TTS; requires FFmpeg and GEMINI_API_KEY."""

import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.request

VOICES = {
    "tmac": "charon", "nash": "puck", "rip": "iapetus",
    "rodman": "fenrir", "bwallace": "algenib", "rallen": "schedar",
    "ginobili": "zubenelgenubi", "iverson": "umbriel", "carter": "alnilam",
}
MODEL = "gemini-2.5-flash-preview-tts"
PROMPT = "用自然的普通话说出以下台词，只说台词，不要读出指令，不要添加任何内容：\n"
LAST_REQUEST = 0.0


def synthesize(text, voice, cache, take, attempt=0, model=MODEL):
    global LAST_REQUEST
    if attempt < 6:
        prompt = PROMPT + text
    elif attempt < 12:
        prompt = "Say in Mandarin, only the following line: " + text + " "
    elif attempt < 18:
        prompt = text + " "
    else:
        prompt = "Read this Chinese basketball game voice line aloud naturally:\n" + text + "。"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {
                "voiceName": voice.capitalize(),
            }}},
        },
    }
    body = json.dumps(payload, ensure_ascii=False).encode()
    variant = str(take) if attempt == 0 else f"{take}-retry" if attempt == 1 else f"{take}-retry-{attempt}"
    digest = hashlib.sha256(model.encode() + body + variant.encode()).hexdigest()
    raw = cache / f"{digest}.json"
    if not raw.exists():
        request = urllib.request.Request(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            data=body, headers={"Content-Type": "application/json",
                                "x-goog-api-key": os.environ["GEMINI_API_KEY"]},
        )
        for http_attempt in range(3):
            try:
                time.sleep(max(0, 8 - (time.monotonic() - LAST_REQUEST)))
                LAST_REQUEST = time.monotonic()
                with urllib.request.urlopen(request, timeout=180) as response:
                    result = response.read()
                raw.write_bytes(result)
                break
            except urllib.error.HTTPError as error:
                detail = error.read().decode()
                if error.code == 429 and http_attempt < 2:
                    if "per_day" in detail or "PerDay" in detail:
                        raise RuntimeError(f"Gemini HTTP {error.code}: {detail}") from None
                    details = json.loads(detail).get("error", {}).get("details", [])
                    retry = next((d.get("retryDelay") for d in details
                                  if d.get("@type", "").endswith("RetryInfo")), None)
                    if retry and float(retry.rstrip("s")) <= 120:
                        print(f"Gemini HTTP 429; retrying in {retry}", flush=True)
                        time.sleep(float(retry.rstrip("s")) + 2)
                        continue
                raise RuntimeError(f"Gemini HTTP {error.code}: {detail}") from None
    response = json.loads(raw.read_bytes())
    parts = response.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    audio = [p["inlineData"] for p in parts if "inlineData" in p]
    if not audio or not all(a["mimeType"].startswith("audio/") for a in audio):
        if attempt < 23:
            return synthesize(text, voice, cache, take, attempt=attempt + 1, model=model)
        raise ValueError(f"Gemini returned no audio: {response}")
    return b"".join(base64.b64decode(a["data"], validate=True) for a in audio)


def generate(args):
    root = Path(__file__).resolve().parent
    if args.cache.resolve().is_relative_to(root.parent):
        raise ValueError("Raw response cache must be outside the repository")
    args.cache.mkdir(parents=True, exist_ok=True)
    manifest_path = root / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    takes_path = root / "gemini-takes.json"
    takes = json.loads(takes_path.read_text()) if takes_path.exists() else {}
    for key in args.keys:
        pack = manifest["voices"][key]
        sprite = bytearray()
        for entries in pack["lines"].values():
            for entry in entries:
                take = takes.get(entry["f"], args.take) if args.take == 0 else args.take
                pcm = synthesize(entry["t"], VOICES[key], args.cache, take, model=args.model)
                clip = args.cache / entry["f"]
                trim = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05"
                analysis = subprocess.run([
                    "ffmpeg", "-hide_banner", "-f", "s16le", "-ar", "24000", "-ac", "1",
                    "-i", "pipe:0", "-af", trim + ",loudnorm=print_format=json",
                    "-f", "null", "-",
                ], input=pcm, capture_output=True, check=True).stderr.decode()
                measured = json.loads(analysis[analysis.rfind("{"):])
                gain = min(-20.7 - float(measured["input_i"]),
                           -4 - float(measured["input_tp"]))
                subprocess.run([
                    "ffmpeg", "-v", "error", "-y", "-f", "s16le", "-ar", "24000",
                    "-ac", "1", "-i", "pipe:0", "-af",
                    trim + f",volume={gain}dB",
                    "-ac", "1", "-ar", "24000", "-c:a", "libmp3lame", "-b:a", "40k",
                    "-write_xing", "0", "-id3v2_version", "0", "-map_metadata", "-1", str(clip),
                ], input=pcm, check=True)
                data = clip.read_bytes()
                if not data or len(data) % 120:
                    raise ValueError(f"{entry['f']}: not fixed 120-byte MP3 frames")
                entry.update(d=round(len(data) // 120 * 0.024, 3),
                             o=len(sprite) // 120, n=len(data) // 120)
                sprite.extend(data)
                print(f"{key}: {entry['f']} {entry['d']}s", flush=True)
        pack["voice"] = VOICES[key]
        pack["frames"] = len(sprite) // 120
        (root / pack["s"]).write_bytes(sprite)
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", default=MODEL)
    parser.add_argument("--cache", type=Path, default=Path.home() / ".cache/pixelhoops-voice/gemini")
    parser.add_argument("--keys", nargs="+", choices=VOICES, default=list(VOICES))
    parser.add_argument("--take", type=int, default=0, help="Cache variant for regenerating failed takes")
    generate(parser.parse_args())
