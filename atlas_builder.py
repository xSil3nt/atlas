import os
import sys
import shutil
import tempfile
import subprocess
import argparse
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import requests
from PIL import Image

ATLAS_COLS = 10
ATLAS_ROWS = 7


def parse_spreadsheet_id(sheet_url):
    return sheet_url.split("/d/")[1].split("/")[0]


def parse_gid(sheet_url):
    parsed = urlparse(sheet_url)

    query_gid = parse_qs(parsed.query).get("gid")
    if query_gid:
        try:
            return int(query_gid[0])
        except ValueError:
            return None

    fragment_gid = parse_qs(parsed.fragment).get("gid")
    if fragment_gid:
        try:
            return int(fragment_gid[0])
        except ValueError:
            return None

    return None


def export_tab_as_pdf(spreadsheet_id, gid):
    export_url = (
        f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}"
        f"/export?format=pdf&gid={gid}"
    )

    response = requests.get(export_url, timeout=120)
    response.raise_for_status()

    if not response.content.startswith(b"%PDF"):
        raise RuntimeError(
            "Export did not return a PDF. Make sure the sheet is public and the gid is valid."
        )

    return response.content


def extract_card_images_from_pdf(pdf_bytes):
    with tempfile.TemporaryDirectory() as tmp:
        pdf_path = os.path.join(tmp, "sheet.pdf")
        image_prefix = os.path.join(tmp, "img")

        with open(pdf_path, "wb") as pdf_file:
            pdf_file.write(pdf_bytes)

        result = subprocess.run(
            ["pdfimages", "-png", pdf_path, image_prefix],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise RuntimeError(f"pdfimages failed: {result.stderr}")

        image_paths = sorted(Path(tmp).glob("img-*.png"))
        images = [Image.open(path).convert("RGB") for path in image_paths]

    return images


def apply_deck_rules(images):
    if len(images) < 3:
        raise ValueError(f"Expected at least 3 images from the sheet, got {len(images)}.")

    card_back = images[0]
    # images[1] is the resource card, and does not go in the deck.

    face_cards = []
    for index, image in enumerate(images[2:], start=2):
        copies = 2 if index <= 3 else 3
        face_cards.extend([image] * copies)

    return card_back, face_cards


def build_atlas(card_back, face_cards, output_path):
    max_slots = ATLAS_COLS * ATLAS_ROWS
    face_slots = max_slots - 1

    if len(face_cards) > face_slots:
        print(
            f"  WARNING: {len(face_cards)} face slots needed but only {face_slots} available. "
            "Extra cards dropped."
        )
        face_cards = face_cards[:face_slots]

    card_w, card_h = face_cards[0].size

    atlas_w = ATLAS_COLS * card_w
    atlas_h = ATLAS_ROWS * card_h
    atlas = Image.new("RGB", (atlas_w, atlas_h), (0, 0, 0))

    for index, image in enumerate(face_cards):
        col = index % ATLAS_COLS
        row = index // ATLAS_COLS
        atlas.paste(image.convert("RGB"), (col * card_w, row * card_h))

    back_col = (max_slots - 1) % ATLAS_COLS
    back_row = (max_slots - 1) // ATLAS_COLS
    atlas.paste(
        card_back.convert("RGB").resize((card_w, card_h), Image.LANCZOS),
        (back_col * card_w, back_row * card_h),
    )

    atlas.save(output_path, "PNG")
    print(f"\nAtlas saved → {output_path}")
    print(f"  {len(face_cards)} face slots + 1 card back")
    print(f"  Atlas size: {atlas_w}×{atlas_h}px  ({ATLAS_COLS} cols × {ATLAS_ROWS} rows)")
    print(f"  Card slot:  {card_w}×{card_h}px")
    print("\n  TTS deck JSON settings:")
    print(f"    NumWidth:  {ATLAS_COLS}")
    print(f"    NumHeight: {ATLAS_ROWS}")


def main():
    if not shutil.which("pdfimages"):
        print("ERROR: 'pdfimages' not found on PATH.")
        print("  Install poppler-utils:  sudo pacman -S poppler  (Arch)")
        print("                          sudo apt install poppler-utils  (Debian/Ubuntu)")
        sys.exit(1)

    parser = argparse.ArgumentParser(
        description="Build a TTS atlas from a public Google Sheet (in-cell images)."
    )
    parser.add_argument("--sheet-url", help="Full Google Sheets URL")
    parser.add_argument("--gid", type=int, help="Sheet tab gid (optional)")
    parser.add_argument("--out", default="atlas.png", help="Output PNG filename")
    args = parser.parse_args()

    if args.sheet_url:
        sheet_url = args.sheet_url.strip()
    else:
        sheet_url = input("\nPaste the public Google Sheets URL: ").strip()

    spreadsheet_id = parse_spreadsheet_id(sheet_url)
    gid = args.gid if args.gid is not None else parse_gid(sheet_url)
    if gid is None:
        gid = 0

    print(f"\nUsing gid={gid}")

    print("Exporting tab as PDF...")
    pdf_bytes = export_tab_as_pdf(spreadsheet_id, gid)
    print(f"  PDF size: {len(pdf_bytes) // 1024} KB")

    print("Extracting card images via pdfimages...")
    card_images = extract_card_images_from_pdf(pdf_bytes)
    print(f"  Found {len(card_images)} card image(s)")

    if not card_images:
        print("\nNo card images found in the PDF.")
        print("  Make sure cards are inserted with Insert → Image → In cell.")
        sys.exit(1)

    print("\nApplying deck rules:")
    print("  Slot 1 → card back art")
    print("  Slot 2 → skipped (resource card)")
    print("  Slot 3 → 2 copies")
    print("  Slot 4 → 2 copies")
    print("  Slots 5+ → 3 copies each")
    card_back, face_cards = apply_deck_rules(card_images)
    print(f"  {len(face_cards)} total face slots from {len(card_images) - 2} deck cards")

    print(f"\nBuilding {ATLAS_COLS}×{ATLAS_ROWS} atlas...")
    build_atlas(card_back, face_cards, args.out)


if __name__ == "__main__":
    main()
