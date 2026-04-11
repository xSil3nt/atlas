import os
import sys
import argparse

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build


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


def main():
    parser = argparse.ArgumentParser(
        description="Build a TTS atlas from a Google Sheet (in-cell images)."
    )
    parser.add_argument("--sheet-url", help="Full Google Sheets URL")
    parser.add_argument("--tab", help="Sheet tab name")
    parser.add_argument("--out", default="atlas.png", help="Output PNG filename")
    args = parser.parse_args()

    print("Authenticating with Google...")
    creds = get_google_creds()
    build("sheets", "v4", credentials=creds)

    if args.sheet_url:
        parse_spreadsheet_id(args.sheet_url)

    print("Scaffold ready. More steps coming in next commits.")


if __name__ == "__main__":
    main()
