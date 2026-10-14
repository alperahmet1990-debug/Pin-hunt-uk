"""Synthetic release-poster benchmark for multi-pin extraction (no third-party images).

Draws posters in the style of park pin-release signage: a header with the release date, then a
grid of pin "artworks" (simple shapes) with captions (subject, edition, price). Ground truth is
written alongside. Real posters need the maintainer's own photos (see VISION-PROTOCOL.md).

Usage: python3 make_posters.py <out_dir>
"""
import json, pathlib, random, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
SUBJECTS = ["Stitch", "Mickey & Minnie", "Marie", "Dumbo", "Figaro", "Chip 'n Dale", "Pascal", "Lotso",
            "Rapunzel & Flynn", "Cheshire Cat", "Goofy & Max", "Daisy", "Olaf", "Baymax", "Tinker Bell", "Simba"]
EDITIONS = [("Édition limitée 800", "LE", 800), ("Édition limitée 1000", "LE", 1000), ("Édition limitée 700", "LE", 700),
            ("Open edition", "OE", None)]


def poster(seed, n, cols, title, date, difficulty):
    rnd = random.Random(seed)
    W, H = 1600, 220 + ((n + cols - 1) // cols) * 360
    img = Image.new("RGB", (W, H), (250, 245, 235))
    d = ImageDraw.Draw(img)
    d.text((60, 50), title, font=ImageFont.truetype(BOLD, 64), fill=(40, 30, 90))
    d.text((60, 135), f"Pueblo Trading Post · {date}", font=ImageFont.truetype(FONT, 36), fill=(90, 80, 70))
    subjects = rnd.sample(SUBJECTS, n)
    truth = []
    cw = (W - 120) // cols
    for i, s in enumerate(subjects):
        r, c = divmod(i, cols)
        x, y = 60 + c * cw, 220 + r * 360
        col = tuple(rnd.randint(60, 230) for _ in range(3))
        shape = rnd.choice(["ellipse", "rectangle", "polygon"])
        box = (x + 40, y + 10, x + cw - 40, y + 210)
        if shape == "ellipse":
            d.ellipse(box, fill=col, outline=(30, 30, 30), width=6)
        elif shape == "rectangle":
            d.rounded_rectangle(box, 30, fill=col, outline=(30, 30, 30), width=6)
        else:
            cx, cy = (box[0] + box[2]) // 2, (box[1] + box[3]) // 2
            d.polygon([(cx, box[1]), (box[2], cy), (cx, box[3]), (box[0], cy)], fill=col, outline=(30, 30, 30))
        ed_label, ed_type, ed_size = rnd.choice(EDITIONS)
        price = rnd.choice([14.99, 16.99, 18.0, 22.0, 32.0])
        fs = 30 if difficulty < 2 else 22
        d.text((x + 20, y + 225), s, font=ImageFont.truetype(BOLD, fs + 4), fill=(20, 20, 20))
        d.text((x + 20, y + 270), f"{ed_label} · {price:.2f} €", font=ImageFont.truetype(FONT, fs), fill=(60, 60, 60))
        truth.append({"subject": s, "edition_type": ed_type, "edition_size": ed_size, "price_eur": price, "position": i + 1})
    if difficulty >= 2:
        img = img.rotate(rnd.uniform(-4, 4), expand=True, fillcolor=(200, 200, 200)).filter(ImageFilter.GaussianBlur(1.2))
        img = img.resize((img.width * 2 // 3, img.height * 2 // 3))
    return img, {"title": title, "date": date, "pins": truth}


if __name__ == "__main__":
    out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
    specs = [(1, 6, 3, "Nouveautés pins · Octobre", "2026-10-03", 0),
             (2, 9, 3, "Pin Trading Night · Enchanted", "2026-09-19", 1),
             (3, 12, 4, "Halloween Pins 2026", "2026-09-26", 2)]
    for seed, n, cols, title, date, diff in specs:
        img, truth = poster(seed, n, cols, title, date, diff)
        img.save(out / f"poster_{seed}.png")
        (out / f"poster_{seed}.truth.json").write_text(json.dumps(truth, ensure_ascii=False, indent=1))
    print("wrote", len(specs), "posters to", out)
