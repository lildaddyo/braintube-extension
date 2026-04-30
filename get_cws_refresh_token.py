"""
get_cws_refresh_token.py
─────────────────────────────────────────────────────────────────────────────
Generates a CWS OAuth2 refresh token for use in CI/CD.

Prerequisites:
  1. Google Cloud Console → APIs & Services → Enable "Chrome Web Store API"
  2. APIs & Services → Credentials → Create OAuth 2.0 Client ID
       Application type: Desktop app
       Name: BrainTube CWS Deploy (or anything)
  3. Download credentials JSON — you'll need CLIENT_ID and CLIENT_SECRET from it

Usage:
  pip install google-auth-oauthlib
  python get_cws_refresh_token.py

The script opens your browser, asks you to sign in with the CWS publisher
account (ilian@vrexpress.io), approve the Chrome Web Store scope, then prints
the refresh token to terminal. Copy it into:
  GitHub → Settings → Secrets → CWS_REFRESH_TOKEN
"""

import json
import sys
import os

try:
    from google_auth_oauthlib.flow import InstalledAppFlow
except ImportError:
    print("Missing dependency. Run: pip install google-auth-oauthlib")
    sys.exit(1)

# Chrome Web Store publish scope
SCOPES = ["https://www.googleapis.com/auth/chromewebstore"]

def main():
    print("=" * 60)
    print("  BrainTube CWS Refresh Token Generator")
    print("=" * 60)
    print()

    # Read credentials from env or prompt
    client_id = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET", "").strip()

    if not client_id:
        print("Enter your Google OAuth Client ID")
        print("(from Google Cloud Console → Credentials → OAuth 2.0 Client IDs)")
        client_id = input("CLIENT_ID: ").strip()

    if not client_secret:
        client_secret = input("CLIENT_SECRET: ").strip()

    if not client_id or not client_secret:
        print("ERROR: Both CLIENT_ID and CLIENT_SECRET are required.")
        sys.exit(1)

    # Build the client config dict (same format as downloaded credentials JSON)
    client_config = {
        "installed": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": ["urn:ietf:wg:oauth:2.0:oob", "http://localhost"],
        }
    }

    print()
    print("Opening browser for Google sign-in...")
    print("Sign in with: ilian@vrexpress.io")
    print("Approve the 'Chrome Web Store' scope when prompted.")
    print()

    flow = InstalledAppFlow.from_client_config(client_config, scopes=SCOPES)
    # run_local_server opens browser, starts local HTTP server to catch redirect
    credentials = flow.run_local_server(port=0, prompt="consent", access_type="offline")

    print()
    print("=" * 60)
    print("  ✅ SUCCESS — Copy the token below into GitHub Secrets")
    print("=" * 60)
    print()
    print(f"  Secret name:  CWS_REFRESH_TOKEN")
    print(f"  Secret value: {credentials.refresh_token}")
    print()
    print("  GitHub → lildaddyo/braintube-extension → Settings →")
    print("  Secrets and variables → Actions → New repository secret")
    print()
    print("  Also set these if not already present:")
    print(f"  CWS_CLIENT_ID     = {client_id}")
    print(f"  CWS_CLIENT_SECRET = (the value you just entered)")
    print(f"  CWS_EXTENSION_ID  = aepdagkfkllhejenkakmbllgkbofndfb")
    print()

if __name__ == "__main__":
    main()
