# AI Word OP_RETURN / SugarWords Implementation

This document describes the implementation of the **AI Word OP_RETURN** wallet tab, internally branded as **SugarWords**.

## Purpose

SugarWords generates a new coined English word with an LLM, lets the user review or edit the generated fields, and writes a compact word record to Sugarchain with a zero-value `OP_RETURN` output.

The on-chain protocol is:

```text
SW|word|part_of_speech|meaning
```

The full word session, including the longer etymology explanation, remains local and downloadable as JSON.

## Files

- `index.html`
  - Adds the `AI Word OP_RETURN` wallet tab.
  - Implements the SugarWords UI, validation, session memory, payload display, OP_RETURN transaction creation, confirmation modal, broadcast handling, verification, and JSON download.
- `server.js`
  - Serves the static wallet locally.
  - Implements `POST /api/generate-word`.
  - Calls the MiniMax OpenAI-compatible chat completions API with `MiniMax-M3`.
  - Keeps the API key server-side in `process.env.MINIMAX_API_KEY`.
- `package.json`
  - Adds `npm start` for local serving.
- `README.md`
  - Documents setup and user-facing behavior.

## Frontend Tab

The wallet tab is added to the existing wallet tab list as:

```text
AI Word OP_RETURN
```

The visible feature title inside the tab is:

```text
SugarWords
```

The tab includes:

- `Invent New Word`
- `Write to Sugarchain OP_RETURN`
- `Verify on-chain`
- `Download Session JSON`
- Generated word display
- Editable `Part of Speech`
- Editable `Meaning`
- Editable `Etymology meaning`
- Human-readable OP_RETURN payload
- OP_RETURN hex payload
- Payload byte length
- Session log table

## LLM Generation

The frontend calls:

```http
POST /api/generate-word
```

Request shape:

```json
{
  "used_words": ["brumanza", "vivrama"],
  "used_meanings": ["a prior generated meaning"]
}
```

Response shape:

```json
{
  "word": "lowercase_new_word",
  "meaning": "short meaning in plain English",
  "etymology_meaning": "short root explanation",
  "confidence_not_existing": 0.91
}
```

The backend prompt uses a randomized design brief on every request:

- Semantic target
- Tone
- Word-shape style
- German, Latin, French, English/Old English, and Nordic/Old Norse root families
- Recent meanings to avoid
- Repetition bans for generic twilight/hope-style definitions

The current model is configured as:

```text
MiniMax-M3
```

The API key is read from:

```text
MINIMAX_API_KEY
```

No API key should be committed, logged, bundled into frontend JavaScript, or stored in browser storage.

## Validation

The backend and frontend validate generated records.

Word rules:

- 2-32 characters
- lowercase letters
- optional single hyphen
- no spaces
- no digits
- no punctuation except the optional hyphen
- cannot duplicate a session word

Display field rules:

- `part_of_speech`: one of `n`, `v`, `adj`, `adv`, `pron`, `prep`, `conj`, `interj`
- `meaning`: up to 65 ASCII characters locally and in the prompt, or less on-chain if a long word/part-of-speech abbreviation leaves less room in `SW|word|part_of_speech|meaning`
- `etymology_meaning`: 1-40 characters

On-chain payload target:

- 80 bytes or less

If the payload is too long, the frontend compacts `meaning`. If the result is still too long, posting is blocked.

## Session State

SugarWords keeps session state in browser memory and persists the session log to `localStorage`.

Important state:

```js
usedWords = Set<string>
postedWords = Set<string>
records = []
```

Duplicate rules:

- A word cannot be generated twice in the same session.
- A word cannot be posted twice in the same session.
- Duplicate generation or posting is blocked before transaction broadcast.

## OP_RETURN Transaction Flow

SugarWords reuses the existing wallet transaction infrastructure.

Flow:

1. User clicks `Invent New Word`.
2. Frontend calls `/api/generate-word`.
3. User reviews or edits fields.
4. Before preparing a transaction, the frontend asks the local Word Explorer API to search Sugarchain directly for a verified SugarWords claim using the same word. This preflight scans blocks after height `42900000`, resumes from the last completed preflight scan, and skips coinbase-only blocks. If a matching claim exists, posting is blocked and the user is told the word is already coined.
5. Frontend builds:

   ```text
   SW|word|part_of_speech|meaning
   ```

6. Frontend displays payload, hex, and byte length.
7. User clicks `Write to Sugarchain OP_RETURN`.
8. Wallet loads UTXOs for the active address.
9. Wallet builds a signed transaction with:
   - Output 1: zero-value `OP_RETURN <payload bytes>`
   - Output 2: change back to the wallet address
10. Confirmation modal displays:
   - word
   - part_of_speech
   - compact meaning
   - payload
   - byte length
   - estimated fee
   - funding/change address
11. User confirms broadcast.
12. Wallet broadcasts with the existing backend broadcast method.
13. Returned txid is saved to the session log.

No SUGAR value is sent to the OP_RETURN output. The user pays only the network fee.

## Verification

If a txid exists, `Verify on-chain` fetches the transaction through the wallet transaction API, extracts OP_RETURN payloads, and checks whether one matches the local `SW` payload hex.

Verification states are shown in the tab status area.

## Session JSON Download

`Download Session JSON` exports:

```json
{
  "schema": "sugarchain_sugarwords_session_v1",
  "created_at": "<ISO timestamp>",
  "chain": "sugarchain",
  "protocol": "SW",
  "records": []
}
```

Each record includes:

- word
- part_of_speech
- meaning
- etymology_meaning
- op_return_payload
- op_return_hex
- byte_length
- txid
- status
- timestamp

## Local Run

PowerShell:

```powershell
$env:MINIMAX_API_KEY="your_key_here"
npm start
```

Open:

```text
http://localhost:8080/#/
```

## Security Notes

- Do not commit API keys.
- Do not place API keys in frontend JavaScript.
- Do not store API keys in browser storage.
- Do not expose wallet private keys or seed phrases.
- Do not auto-broadcast transactions.
- Always require user confirmation before broadcasting.
