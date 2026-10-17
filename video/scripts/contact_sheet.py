"""Builds contact sheets from out/stills (frames.json + element-*.jpeg). Uses Pillow.

    python3 -I scripts/contact_sheet.py out/stills out
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

stillsDir, outDir = Path(sys.argv[1]), Path(sys.argv[2])
items = json.loads((stillsDir / "frames.json").read_text())
thumbW, thumbH, labelH, cols, perSheet = 480, 270, 46, 4, 24
try:
    font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 17)
except OSError:
    font = ImageFont.load_default()

sheets = []
for start in range(0, len(items), perSheet):
    chunk = items[start : start + perSheet]
    rows = (len(chunk) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * thumbW + (cols + 1) * 8, rows * (thumbH + labelH) + (rows + 1) * 8), (20, 20, 20))
    draw = ImageDraw.Draw(sheet)
    for index, item in enumerate(chunk):
        matches = sorted(stillsDir.glob(f"element-{item['frame']:04d}.*"))
        if not matches:
            continue
        thumb = Image.open(matches[0]).convert("RGB").resize((thumbW, thumbH), Image.LANCZOS)
        x = 8 + (index % cols) * (thumbW + 8)
        y = 8 + (index // cols) * (thumbH + labelH + 8)
        sheet.paste(thumb, (x, y))
        minutes, seconds = divmod(item["seconds"], 60)
        draw.text((x, y + thumbH + 4), f"f{item['frame']}  {int(minutes)}:{seconds:05.2f}", fill=(255, 255, 255), font=font)
        draw.text((x, y + thumbH + 24), item["label"][:56], fill=(170, 180, 200), font=font)
    name = outDir / f"contact-sheet-{len(sheets) + 1:02d}.jpg"
    sheet.save(name, quality=88)
    sheets.append(name)
print("\n".join(str(s) for s in sheets))
