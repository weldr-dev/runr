#!/usr/bin/env python3
import json, sys

# Usage: cast_clip.py input.cast output.cast start end
# Example: cast_clip.py demo/day5.cast demo/clip1.cast 25 60

inp, outp, start_s, end_s = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4])

with open(inp, "r", encoding="utf-8") as f:
    header = json.loads(f.readline())
    events = [json.loads(line) for line in f if line.strip()]

# asciicast v2: header JSON line, then event lines: [time, "o"/"i", "data"]
clipped = []
for e in events:
    t = float(e[0])
    if start_s <= t <= end_s:
        e[0] = t - start_s
        clipped.append(e)

# update duration if present (optional but nice)
header["duration"] = max([e[0] for e in clipped], default=0.0)

with open(outp, "w", encoding="utf-8") as f:
    f.write(json.dumps(header, separators=(",", ":")) + "\n")
    for e in clipped:
        f.write(json.dumps(e, separators=(",", ":")) + "\n")
