"""
Run this whenever the decks change to regenerate cards.json.
Usage: python3 generate_cards.py
"""

import base64
import json
import os
import shutil
import subprocess
import sys
import tempfile
from io import BytesIO
from pathlib import Path

import requests
from PIL import Image

# ---- CONFIG ---------------------------------------------------------------
DECKS = [
    {"name": "Heart", "url": "https://docs.google.com/spreadsheets/d/1ju6WsTsuWQGEr2l8MtlX94IKGe-h3hBs0dWXNJ5nGGg/edit?gid=1001420764#gid=1001420764"},
    {"name": "Brain", "url": "https://docs.google.com/spreadsheets/d/1ju6WsTsuWQGEr2l8MtlX94IKGe-h3hBs0dWXNJ5nGGg/edit?gid=427720609#gid=427720609"},
    {"name": "Soul",  "url": "https://docs.google.com/spreadsheets/d/1ju6WsTsuWQGEr2l8MtlX94IKGe-h3hBs0dWXNJ5nGGg/edit?gid=1894443892#gid=1894443892"},
    {"name": "Eye",   "url": "https://docs.google.com/spreadsheets/d/1ju6WsTsuWQGEr2l8MtlX94IKGe-h3hBs0dWXNJ5nGGg/edit?gid=1531951145#gid=1531951145"},
]

RESOURCE_SHEET = {
    "url": "https://docs.google.com/spreadsheets/d/1T0JGXIxMO5O12JURMoGmVnPnJNGxz7rGVik53X4Lvzw/edit?gid=297043409#gid=297043409"
}
# ---------------------------------------------------------------------------


def parse_spreadsheet_id(url):
    return url.split("/d/")[1].split("/")[0]


def parse_gid(url):
    import re
    m = re.search(r"[?&#]gid=(\d+)", url)
    return m.group(1) if m else "0"


def fetch_pdf(url):
    sid = parse_spreadsheet_id(url)
    gid = parse_gid(url)
    export_url = f"https://docs.google.com/spreadsheets/d/{sid}/export?format=pdf&gid={gid}"
    resp = requests.get(export_url, timeout=120)
    resp.raise_for_status()
    if not resp.content.startswith(b"%PDF"):
        raise RuntimeError("response wasn't a PDF — is the sheet public?")
    return resp.content


def extract_images(pdf_bytes):
    with tempfile.TemporaryDirectory() as tmp:
        pdf_path = os.path.join(tmp, "sheet.pdf")
        prefix = os.path.join(tmp, "img")
        with open(pdf_path, "wb") as f:
            f.write(pdf_bytes)
        result = subprocess.run(
            ["pdfimages", "-png", pdf_path, prefix],
            capture_output=True, text=True,
        )
        if result.returncode != 0:
            raise RuntimeError(f"pdfimages failed: {result.stderr}")
        paths = sorted(Path(tmp).glob("img-*.png"))
        return [Image.open(p).convert("RGB") for p in paths]


def img_to_dataurl(img):
    buf = BytesIO()
    img.save(buf, "PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    return f"data:image/png;base64,{b64}"


def main():
    if not shutil.which("pdfimages"):
        print("ERROR: pdfimages not found — install poppler-utils")
        sys.exit(1)

    decks_out = []
    for deck in DECKS:
        name = deck["name"]
        url = deck["url"].strip()

        if not url:
            print(f"{name}: skipped (no URL)")
            decks_out.append({"name": name, "back": None, "faces": []})
            continue

        print(f"{name}: fetching PDF...")
        try:
            pdf = fetch_pdf(url)
            print(f"  extracting images...")
            images = extract_images(pdf)

            if len(images) < 3:
                raise ValueError(f"only {len(images)} images found, expected at least 3")

            # index 0 = card back, index 1 = skipped (legacy resource slot), index 2+ = face cards
            back = images[0]
            faces = images[2:]
            print(f"  {len(faces)} face cards")

            decks_out.append({
                "name": name,
                "back": img_to_dataurl(back),
                "faces": [img_to_dataurl(f) for f in faces],
            })
        except Exception as e:
            print(f"  ERROR: {e}")
            decks_out.append({"name": name, "back": None, "faces": [], "error": str(e)})

    # Resource sheet — index 0 = back, index 1+ = resource card faces
    print("Resources: fetching PDF...")
    try:
        pdf = fetch_pdf(RESOURCE_SHEET["url"])
        print("  extracting images...")
        images = extract_images(pdf)

        if len(images) < 2:
            raise ValueError(f"only {len(images)} images found, expected at least 2")

        back = images[0]
        faces = images[1:]
        print(f"  {len(faces)} resource cards")

        resources_out = {
            "back": img_to_dataurl(back),
            "faces": [img_to_dataurl(f) for f in faces],
        }
    except Exception as e:
        print(f"  ERROR: {e}")
        resources_out = {"back": None, "faces": [], "error": str(e)}

    with open("cards.json", "w") as f:
        json.dump({"decks": decks_out, "resources": resources_out}, f)

    print("\ndone — cards.json saved")


if __name__ == "__main__":
    main()
