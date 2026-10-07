# LinguaBridge

Two-way multilingual chat. Each person types in their own language (native script or romanized: Hinglish, Tanglish, …) and reads everyone else's messages in theirs.

- `backend/`: Node + TypeScript, Express REST, WebSocket, PostgreSQL, Gemini (free tier) or Claude for detection and translation
- `mobile/`: React Native (Expo, TypeScript)

## Run it

```bash
# 1. backend
cd backend
cp .env.example .env          # set GEMINI_API_KEY (free) or ANTHROPIC_API_KEY, and DATABASE_URL
createdb linguabridge
npm install
npm run dev                   # migrates the schema and seeds 3 demo contacts
npm test                      # pipeline tests (no API key or DB needed)

# 2. mobile (needs a dev build because on-device speech recognition is a native module)
cd ../mobile
npm install
npx expo run:android          # or: npx expo run:ios
```

The app points at `http://localhost:4000` (iOS simulator) or `http://10.0.2.2:4000` (Android emulator).
For a real phone, set the server address in Settings, or `extra.apiUrl` in `app.json`.
To try it alone, tap **New Conversation** and pick a demo contact (Priya / Hinglish, Karthik / Tanglish, Lucía / Spanish).

## Build an Android APK

The APK has to be built with EAS (Expo's free cloud build) or locally with the Android SDK:

```bash
cd mobile
# 1. put your deployed backend URL in app.json -> expo.extra.apiUrl (a phone can't reach "localhost")
npm install -g eas-cli
eas login
eas build:configure            # first time only
eas build -p android --profile preview   # gives a download link for the .apk
```

The backend must be reachable from the phone (deploy `backend/` to Railway, Render, Fly, etc. with a Postgres add-on and the env vars from `.env.example`).

## How a message flows

1. Sender types text, or speaks and the on-device speech-to-text result becomes the text.
2. `POST /api/conversations/:id/messages`
3. Pipeline (`backend/src/pipeline`):
   1. Empty check. Emoji/number-only text skips the model.
   2. Unicode script detection (`script.ts`).
   3. Offline lexicon hints for romanized text (`romanized.ts`). "nee enga iruka" scores as Tamil, never English.
   4. One Claude call (forced tool use, structured output) that detects language, script, romanized flag, confidence and code-mixing, then translates into the recipient's language and format. It gets the sender's declared language and the last 6 messages as context.
   5. Validation: if the recipient wants Tanglish-only and Tamil script appears, the call is retried once. If it still leaks, non-Latin characters are stripped, so Tamil script never reaches a Tanglish-only user. The result is marked `degraded`.
4. The message and its translation are stored. Both users get it over WebSocket.

Each recipient sees their own preferences applied: language, output format (script / romanized / both), display layers, English. Sender's translation mode (casual / natural / literal) shapes how their messages are translated. Default is casual.

## Result shape

```json
{
  "originalText": "Kal tum free ho kya?",
  "detectedLanguage": "Hindi", "detectedLanguageCode": "hi",
  "detectedScript": "Latin", "isRomanized": true,
  "targetLanguageCode": "ta",
  "translations": {
    "tamil": { "native": "நாளைக்கு நீ ஃப்ரீயா இருக்கியா?", "romanized": "Naalaiku nee free-ah irukkiya?" },
    "english": "Are you free tomorrow?"
  },
  "tone": "casual", "confidence": 0.96, "status": "ok", "mode": "casual", "format": "both"
}
```

`native` is the script text and `romanized` is the Latin transliteration. `status` is `ok`, `low_confidence`, `degraded`, `skipped` or `failed`.

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/register`, `/api/auth/login` | username-based accounts |
| GET/PATCH | `/api/me` | profile and all preferences |
| GET/POST | `/api/conversations` | list / open by peer username |
| GET/POST | `/api/conversations/:id/messages` | history / send |
| POST | `/api/conversations/:id/preview` | detect + translate without sending (composer preview) |
| POST | `/api/messages/:id/retranslate` | "Translate again" (new phrasing) |
| POST | `/api/vision/extract-text` | photo to text, dropped into the composer |
| POST | `/api/voice/transcribe` | optional server STT (Whisper) |
| WS | `/ws?token=` | `message`, `message_updated` events |

## Adding a language

Add one row to `backend/src/languages.ts` and `mobile/src/languages.ts` (plus a speech locale). Output formats, the romanized variant and the picker pick it up automatically.

## Known limits

- Auth is username-only, with no password or OTP. Fine for a prototype; add real auth before launch.
- File attachments are not implemented. The paperclip shows a notice. Photos are supported as photo-to-text.
- Speech recognition quality depends on the device's recognizer. Romanized speech is transcribed in the speaker's language script, then handled by the pipeline.
- The WebSocket hub is in-process. Use Redis pub/sub to run more than one server.
- Not run against a live Claude key, Postgres, or a device yet. Pipeline logic is covered by tests with a mocked model, and both projects typecheck.
