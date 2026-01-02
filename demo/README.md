# Runr Demo Assets

Deterministic demo scripts for asciinema recording and export.

---

## Quick Start

### 0. Prerequisites

```bash
# Install runr globally (required for demo script)
npm install -g @weldr/runr

# Install asciinema if needed
brew install asciinema
```

### 1. Record the demo

```bash
# Record (this runs the script and captures everything)
cd /Users/vonwao/dev/agent-framework
asciinema rec demo/day5.cast -c "bash demo/day5.sh"
```

The script is **completely deterministic** — no typing, no interaction, no network calls.

### 2. Test playback locally

```bash
asciinema play demo/day5.cast
```

Press space to pause, `q` to quit.

### 3. Upload to asciinema.org (optional)

```bash
asciinema upload demo/day5.cast
```

This gives you a shareable URL for embedding.

---

## Export to GIF (Day 6 assets)

For the 2 GIFs needed in Day 6:

### Install asciicast2gif

```bash
npm install -g asciicast2gif
# or
brew install imagemagick gifsicle
pip install asciinema-gif
```

### Create GIF clips

```bash
# Clip 1: Failure + checkpoints (seconds 25-60)
asciinema cut -s 25 -e 60 demo/day5.cast demo/clip1-failure.cast
asciicast2gif demo/clip1-failure.cast demo/failure-checkpoint.gif

# Clip 2: next_action (seconds 95-125)
asciinema cut -s 95 -e 125 demo/day5.cast demo/clip2-nextaction.cast
asciicast2gif demo/clip2-nextaction.cast demo/next-action.gif
```

**Alternative (simpler):**

Use https://github.com/asciinema/agg (official tool):

```bash
brew install agg

# Full demo as GIF
agg demo/day5.cast demo/day5.gif

# Specific time ranges
agg --from 25 --to 60 demo/day5.cast demo/failure-checkpoint.gif
agg --from 95 --to 125 demo/day5.cast demo/next-action.gif
```

---

## Export to MP4

For sharing on X/HN/Reddit:

### Using svg-term + ffmpeg

```bash
# Install dependencies
npm install -g svg-term-cli
brew install ffmpeg

# Generate MP4
svg-term --cast demo/day5.cast --out demo/day5.svg --window --no-cursor
ffmpeg -i demo/day5.svg demo/day5.mp4
```

### Using termtosvg (alternative)

```bash
pip install termtosvg

# Re-record with termtosvg
termtosvg demo/day5.svg -c "bash demo/day5.sh"

# Convert to MP4
ffmpeg -i demo/day5.svg demo/day5.mp4
```

---

## Embed Options

### In README.md (asciinema player)

```markdown
[![asciicast](https://asciinema.org/a/YOUR_CAST_ID.svg)](https://asciinema.org/a/YOUR_CAST_ID)
```

### In README.md (GIF)

```markdown
![Runr Demo](demo/day5.gif)
```

### In README.md (YouTube video)

After uploading MP4 to YouTube:

```markdown
[![Runr Demo](https://img.youtube.com/vi/YOUR_VIDEO_ID/maxresdefault.jpg)](https://www.youtube.com/watch?v=YOUR_VIDEO_ID)
```

---

## Customizing the Demo

### Adjust pacing

Edit `demo/day5.sh` and change the `pause` values:

```bash
pause 1  # Quick (1 second)
pause 2  # Normal (2 seconds)
pause 4  # Emphasis (4 seconds)
```

### Change terminal size

```bash
# Record with specific dimensions
asciinema rec demo/day5.cast -c "bash demo/day5.sh" --cols 100 --rows 30
```

### Speed up playback

```bash
# Play at 2x speed
asciinema play demo/day5.cast --speed 2

# Or edit the cast file:
# Change "idleTimeLimit" in the header
```

---

## Files

- `day5.sh` - Deterministic demo script
- `day5.cast` - Recorded asciinema session
- `day5.gif` - Full demo as GIF (optional)
- `failure-checkpoint.gif` - Clip 1 for README
- `next-action.gif` - Clip 2 for README
- `day5.mp4` - Video for social sharing (optional)

---

## Tips for Clean Recording

### 1. Terminal setup

```bash
# Use a clean terminal profile
# - Font: Monaco or Menlo, 14-16pt
# - Theme: High contrast (Solarized Dark or similar)
# - Window size: 100x30 (cols x rows)
```

### 2. Pre-flight check

Before recording, verify the run exists:

```bash
node dist/cli.js report 20260102075326 --kpi-only
git log --oneline agent/20260102075326/dogfood-01-polish-init | head -3
```

### 3. Re-recording

If you need to change something:

1. Edit `demo/day5.sh`
2. Re-run: `asciinema rec demo/day5.cast -c "bash demo/day5.sh"` (overwrites)
3. Test: `asciinema play demo/day5.cast`

---

## Publishing Workflow (Day 6)

After recording:

1. **Upload to asciinema.org**: Get shareable URL
2. **Generate 2 GIFs**: For README above-the-fold
3. **Optional MP4**: For X/HN/Reddit
4. **Update README**: Embed demo + GIFs
5. **Commit artifacts**: `git add demo/day5.cast demo/*.gif`

---

## Automation (Future)

To regenerate demos after releases:

```bash
# Add to Makefile or package.json scripts
make demo:
    asciinema rec demo/day5.cast -c "bash demo/day5.sh" --overwrite
    agg --from 25 --to 60 demo/day5.cast demo/failure-checkpoint.gif
    agg --from 95 --to 125 demo/day5.cast demo/next-action.gif

# Run before each release
npm run demo
```

This keeps demos in sync with CLI changes.

---

## Troubleshooting

### "Command not found: runr"

The script uses `alias runr='node dist/cli.js'` internally. Make sure you're in the repo root.

### "Run 20260102075326 not found"

The demo script references a specific dogfood run. If you need to update it:

1. Run a new task
2. Get the run_id
3. Edit `demo/day5.sh` and replace `20260102075326`

### GIF is too large

```bash
# Reduce file size with gifsicle
gifsicle -O3 --lossy=80 -o optimized.gif original.gif
```

### Timing feels off

Adjust `pause` values in `demo/day5.sh` and re-record.

---

## Next Steps

After recording:

- [ ] Test playback: `asciinema play demo/day5.cast`
- [ ] Upload to asciinema.org (optional)
- [ ] Generate 2 GIFs for Day 6
- [ ] Optional: Export to MP4 for social
- [ ] Update README with embeds
