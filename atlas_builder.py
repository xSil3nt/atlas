import os
import sys
import shutil
import tempfile
import subprocess
import argparse
from pathlib import Path

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
import requests
from PIL import Image


SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
]

ATLAS_COLS = 10
ATLAS_ROWS = 7

CREDENTIALS_FILE = "credentials.json"
TOKEN_FILE = "token.json"


def get_google_creds():
    creds = None

    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not os.path.exists(CREDENTIALS_FILE):
                print(f"\nERROR: '{CREDENTIALS_FILE}' not found.")
                print("  Download it from Google Cloud Console → APIs & Services → Credentials.")
                sys.exit(1)

            flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_FILE, SCOPES)
            creds = flow.run_local_server(port=0)

        with open(TOKEN_FILE, "w") as token_file:
            token_file.write(creds.to_json())

    return creds


def parse_spreadsheet_id(sheet_url):
    return sheet_url.split("/d/")[1].split("/")[0]


def get_sheet_tabs(service, spreadsheet_id):
    meta = service.spreadsheets().get(spreadsheetId=spreadsheet_id).execute()
    return [
        (tab["properties"]["title"], tab["properties"]["sheetId"])
        for tab in meta["sheets"]
    ]


def get_gid(service, spreadsheet_id, tab_name):
    for title, gid in get_sheet_tabs(service, spreadsheet_id):
        if title == tab_name:
            return gid
    return None


def export_tab_as_pdf(spreadsheet_id, gid, creds):
    export_url = (
        f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}"
        f"/export?format=pdf&gid={gid}"
    )
    auth_headers = {"Authorization": f"Bearer {creds.token}"}

    # Keep auth header across the docs.google.com -> googleusercontent redirect.
    r1 = requests.get(
        export_url,
        headers=auth_headers,
        timeout=30,
        allow_redirects=False,
    )
    if r1.status_code not in (301, 302, 307, 308):
        r1.raise_for_status()
        return r1.content

    redirect_url = r1.headers["Location"]
    r2 = requests.get(redirect_url, headers=auth_headers, timeout=120)
    r2.raise_for_status()

    if not r2.content.startswith(b"%PDF"):
        raise RuntimeError(
            f"Export did not return a PDF (got {r2.status_code}, {len(r2.content)} bytes)."
        )

    return r2.content


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
        description="Build a TTS atlas from a Google Sheet (in-cell images)."
    )
    parser.add_argument("--sheet-url", help="Full Google Sheets URL")
    parser.add_argument("--tab", help="Sheet tab name")
    parser.add_argument("--out", default="atlas.png", help="Output PNG filename")
    args = parser.parse_args()

    print("Authenticating with Google...")
    creds = get_google_creds()
    service = build("sheets", "v4", credentials=creds)

    if args.sheet_url:
        spreadsheet_id = parse_spreadsheet_id(args.sheet_url)
    else:
        url = input("\nPaste the Google Sheets URL: ").strip()
        spreadsheet_id = parse_spreadsheet_id(url)

    tabs = get_sheet_tabs(service, spreadsheet_id)
    tab_names = [title for title, _ in tabs]
    print(f"\nAvailable tabs: {tab_names}")

    if args.tab:
        tab_name = args.tab
    else:
        print("Enter the tab name (or press Enter for first tab):")
        tab_name = input(f"  [{tab_names[0]}]: ").strip() or tab_names[0]

    gid = get_gid(service, spreadsheet_id, tab_name)
    if gid is None:
        print(f"\nERROR: Tab '{tab_name}' not found.")
        sys.exit(1)

    print(f"\nTab: '{tab_name}' (gid={gid})")
    print("Exporting tab as PDF...")
    pdf_bytes = export_tab_as_pdf(spreadsheet_id, gid, creds)
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
