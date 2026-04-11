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
        (sheet["properties"]["title"], sheet["properties"]["sheetId"])
        for sheet in meta["sheets"]
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

    # Follow redirect manually so auth header stays attached.
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
    with tempfile.TemporaryDirectory() as tmp_dir:
        pdf_path = os.path.join(tmp_dir, "sheet.pdf")
        image_prefix = os.path.join(tmp_dir, "img")

        with open(pdf_path, "wb") as pdf_file:
            pdf_file.write(pdf_bytes)

        result = subprocess.run(
            ["pdfimages", "-png", pdf_path, image_prefix],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise RuntimeError(f"pdfimages failed: {result.stderr}")

        image_paths = sorted(Path(tmp_dir).glob("img-*.png"))
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
    tab_names = [name for name, _ in tabs]
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
    _card_back, face_cards = apply_deck_rules(card_images)
    print(f"  {len(face_cards)} total face slots from {len(card_images) - 2} deck cards")

    print("Image extraction step complete. Next commit will build the atlas.")


if __name__ == "__main__":
    main()
