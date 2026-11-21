"""Generate the three legend packs: pip install edge-tts; ffmpeg required."""

import argparse
import asyncio
import json
from pathlib import Path
import subprocess

import edge_tts


LINES = {
    "tmac": {
        "dom": ["半步就行。剩下的是出手。", "节奏到了，这球我来。"],
        "taunt": ["半步的空当，就够了。", "我不后仰，你也得先跟上。"],
        "make": ["直起出手，稳稳拿下。"],
        "miss": ["没关系，下一球找回来。"],
        "win": ["今天的手感，刚刚好。"],
        "hurt": ["这一回合算你的，接着来。"],
    },
    "nash": {
        "dom": ["你盯我，顺下的那位谁管？", "球在走，机会就会来。"],
        "taunt": ["抬头看看，队友已经跑到了。", "你没跟出来？那这球我自己投。"],
        "make": ["看准空当，再轻轻出手。"],
        "miss": ["这次没进，下次配合再来。"],
        "win": ["好球，是大家一起传出来的。"],
        "hurt": ["被你看穿了，我换个节奏。"],
    },
    "rip": {
        "dom": ["你跟我跑就好。一会儿还有一圈。", "跑到空位，接球就投。"],
        "taunt": ["别停下，我还在跑。", "我在肘区等你，别迟到。"],
        "make": ["绕出来，这两分收下。"],
        "miss": ["这球短了，下一圈再来。"],
        "win": ["跑到最后，机会就是我的。"],
        "hurt": ["跟得不错，下一圈见。"],
    },
}


async def generate(args):
    root = Path(__file__).resolve().parent
    args.cache.mkdir(parents=True, exist_ok=True)
    manifest_path = root / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    for key in args.keys:
        pack = {"voice": args.voice, "lines": {}, "s": f"p/{key}.mp3"}
        sprite = bytearray()
        for event, texts in LINES[key].items():
            pack["lines"][event] = []
            for i, text in enumerate(texts):
                name = f"{key}_{event}_{i}.mp3"
                raw = args.cache / f"{args.voice}-{name}"
                if not raw.exists():
                    await asyncio.wait_for(
                        edge_tts.Communicate(text, args.voice).save(str(raw)), 60
                    )
                clip = args.cache / name
                subprocess.run([
                    "ffmpeg", "-v", "error", "-y", "-i", str(raw),
                    "-af", "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05",
                    "-ac", "1", "-ar", "24000", "-c:a", "libmp3lame", "-b:a", "40k",
                    "-write_xing", "0", "-id3v2_version", "0", "-map_metadata", "-1", str(clip),
                ], check=True)
                data = clip.read_bytes()
                if len(data) % 120 or not data:
                    raise ValueError(f"{name}: not fixed 120-byte MP3 frames")
                duration = float(subprocess.check_output([
                    "ffprobe", "-v", "error", "-show_entries", "format=duration",
                    "-of", "default=nw=1:nk=1", str(clip),
                ]))
                entry = {
                    "f": name, "t": text, "d": round(duration, 3),
                    "o": len(sprite) // 120, "n": len(data) // 120,
                }
                pack["lines"][event].append(entry)
                sprite.extend(data)
        pack["frames"] = len(sprite) // 120
        (root / pack["s"]).write_bytes(sprite)
        manifest["voices"][key] = pack
        print(f"{key}: 8 Mandarin lines, {pack['frames']} frames, {len(sprite)} bytes")
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--voice", default="zh-CN-YunxiNeural")
    parser.add_argument("--cache", type=Path, default=Path.home() / ".cache/pixelhoops-voice/clips")
    parser.add_argument("--keys", nargs="+", choices=LINES, default=list(LINES))
    asyncio.run(generate(parser.parse_args()))
