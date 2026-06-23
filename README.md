#  Web Wallet
Nice and simple web wallet with robust [ApiServer](https://github.com/sugarchain-project/api-server) backend :3

Feel free to modify/use it in your projects :D

P.s. Working example [https://sugar.wtf/wallet/#/](https://github.com/sugarchain-project/api-server)  
P.s.s This wallet heavily based on OutCast3k [coinbin](http://github.com/OutCast3k/coinbin), check out his awesome github!

## AI Word OP_RETURN / SugarWords

SugarWords adds an **AI Word OP_RETURN** wallet tab. It asks a small local backend route to generate one coined English word, then lets the wallet create a compact `SW` OP_RETURN record:

`SW|word|part_of_speech|meaning`

Each generation randomizes an etymology blend across German, Latin, French, English or Old English, and Nordic or Old Norse-style root families, so coined words do not default to Latin-only roots. The backend also gives the LLM a randomized semantic target, tone, word-shape brief, and recent session meanings to avoid repetitive definitions.

The longer etymology explanation stays off-chain in the browser session JSON. The Sugarchain transaction stores only the compact word, part-of-speech abbreviation, and meaning in a zero-value OP_RETURN output, using Sugarchain as a public timestamp ledger. The user pays only the normal network fee.

Run the local server with a MiniMax API key:

```bash
set MINIMAX_API_KEY=your_key_here
npm start
```

PowerShell:

```powershell
$env:MINIMAX_API_KEY="your_key_here"
npm start
```

The frontend calls `POST /api/generate-word`. The server reads `process.env.MINIMAX_API_KEY`, calls MiniMax's OpenAI-compatible chat completions API with the `MiniMax-M3` model, validates strict JSON, rejects malformed or duplicate session words, and returns only the generated word object. Never put the MiniMax key in frontend code or browser storage.

SugarWords keeps an in-memory `usedWords` set and persists the session log to localStorage so refreshes do not erase generated records. It blocks duplicate generation and duplicate posting during the session. Posting always requires a confirmation modal showing the word, compact meaning, OP_RETURN payload, byte length, estimated fee, and funding/change address before broadcast.
