# Lingry

> **Learn a new word. Coin a new thought.**

Lingry is a live AI-powered word creation and discovery platform where people can invent useful new words, publish compact records of them on the Sugarchain blockchain, and explore language as it develops through a public social word stream.

## Project at a Glance

- **Status:** Live
- **Launched:** June 2026
- **Website:** [lingry.net](https://lingry.net/#/)
- **GitHub:** [svetlyoh/web-wallet](https://github.com/svetlyoh/web-wallet)
- **Blockchain:** Sugarchain
- **Parent brand:** Noverel™, creator of SweetWallet
- **Product base:** Built on the SweetWallet foundation and extended into a public language platform
- **Open-source foundation:** [Sugarchain Web Wallet](https://github.com/sugarchain-project/web-wallet)

## Short Description

Lingry turns new ideas into discoverable words. Users can generate a word with AI, create one from their own prompt, review its meaning and etymology, and then coin a compact, timestamped word record on Sugarchain. The public stream, explorer, social reactions, rankings, wallet tools, and agent API make Lingry both a creative application and a growing public lexicon.

## The Problem

- Language changes constantly, but useful new expressions are often scattered across private notes, social posts, and temporary AI conversations.
- AI can create words quickly, yet those results usually have no durable public record or simple way to verify when they were published.
- New words can be difficult to discover, compare, share, and connect back to their creators.
- Existing dictionary platforms usually document established language rather than helping communities create and explore emerging language in real time.

## The Solution

- Lingry combines **AI word creation**, **human prompting**, **blockchain timestamping**, and **social discovery** in one public platform.
- Each coined word is reduced to a compact canonical record containing its language, word, part of speech, and meaning.
- That record is placed in a Sugarchain `OP_RETURN` transaction, creating a permanent and independently verifiable timestamp.
- A fast off-chain index powers the public stream, search, likes, rankings, and other social experiences while Sugarchain remains the source of truth for coined words and SUGAR transfers.

## Key Features

- **AI Generate:** Invent a new word and receive a concise meaning, part of speech, etymology, and confidence score.
- **Prompt for a New Word:** Describe a missing concept and generate a word specifically for it.
- **On-chain Coining:** Publish a compact word record to Sugarchain through `OP_RETURN`.
- **Public Word Stream:** Browse newly coined words, meanings, creators, timestamps, and recent activity.
- **Word Explorer:** Search live records, browse recent words, import a session file, or verify a word by transaction ID.
- **Multilingual Creation:** Create words across 26 language options, including languages that use Latin, Cyrillic, Arabic, Devanagari, Bengali, Chinese, Japanese, Korean, Gurmukhi, and Thai writing systems.
- **Social Layer:** Like words, share them, send real SUGAR tips to creators, and view public rankings.
- **Integrated Wallet:** Create or open a Sugarchain wallet, view keys and balance, and send SUGAR from the same experience.
- **Wallet-first access:** Start with a locally generated Sugarchain identity or bring an existing Lingry back with its private key, then unlock the device with a fixed 4-digit PIN.
- **Non-custodial Transaction Flow:** Private keys remain local; coining and tipping are prepared, signed locally, submitted, and then broadcast.
- **Agent and Developer Access:** A REST/OpenAPI interface and OpenClaw integration support word discovery, generation, candidate storage, coining preparation, streams, and leaderboards.
- **Exportable Work:** Download generated-word session records for personal archiving or later verification.
- **Responsive Experience:** Designed as a lightweight browser application for desktop and mobile use.

## What Makes Lingry Innovative

- **AI-to-blockchain publishing:** Lingry connects a creative AI workflow directly to a compact, verifiable blockchain record.
- **A living public lexicon:** It treats language creation as an ongoing public activity rather than a closed dictionary-editing process.
- **Hybrid architecture:** Permanent word records and real transfers live on Sugarchain, while fast social data remains off-chain for usability and scale.
- **Wallet-based identity:** The creator's Sugarchain address connects authorship, word activity, tipping, and verification without requiring Lingry to hold the user's private key.
- **Multilingual by design:** New words can be created and recorded in native writing systems instead of being limited to English or transliterated text.
- **Human and agent participation:** The same platform supports browser users, developers, and locally controlled AI agents.

## Blockchain Use

Lingry uses the **Sugarchain blockchain** as a public timestamp ledger and verification layer.

- Coined words use a compact canonical payload such as:

  ```text
  S<language_code>|<word>|<part_of_speech>|<meaning>
  ```

- The payload is stored in a zero-value `OP_RETURN` output.
- The user pays the normal Sugarchain network fee.
- The transaction ID can be used to verify the exact record later.
- SUGAR tips and wallet transfers are real Sugarchain transactions.
- Likes and other high-speed social metadata are indexed off-chain.

## Technology

- **Frontend:** HTML5, CSS3, vanilla JavaScript, jQuery, Bootstrap, and a hash-routed single-page interface
- **Wallet and transactions:** `bitcoinjs-lib` with Sugarchain network support
- **AI:** MiniMax M3 through an OpenAI-compatible chat completions API
- **Production backend:** Cloudflare Workers running JavaScript
- **Data and coordination:** Cloudflare D1 (SQLite) and Durable Objects
- **Public indexing:** Scheduled blockchain scanning with Cloudflare Cron Triggers and D1/R2-backed snapshots
- **Local development:** Node.js 18+
- **API:** REST endpoints with an OpenAPI specification, bearer sessions, and idempotency protection for state-changing requests
- **Security model:** Local private-key handling and transaction signing; the public API rejects private keys, WIFs, seeds, and mnemonics. A non-extractable browser device key and a PIN-derived key protect the encrypted local wallet vault.

## Authentication and Recovery

Lingry uses the Sugarchain wallet as its durable identity. It does not present email/password account creation, password access, third-party sign-in, or separate account-creation and account-access tabs.

- A fresh device offers **Start New** and **I already have Lingry**.
- **Start New** generates the Sugarchain wallet locally, proves wallet control with a short-lived one-time signed challenge, prompts the user to save the private key, and then requires a 4-digit device PIN.
- **I already have Lingry** validates the private key locally, derives the public key and address locally, and sends only the address, public key, challenge ID, and signature to the Worker. A valid signed proof restores the same stable address-based identity even when an older wallet predates Lingry's D1 identity records. Recovery never sends the WIF/private key to Cloudflare.
- An existing device opens with four mobile-friendly PIN boxes and submits automatically after the fourth digit.
- The 4-digit PIN is local to that browser/device. It is never sent to the Worker and is not the blockchain identity or a replacement for the private key.
- D1 keeps one unique normalized wallet-address identity. Recovery resolves that mapping, including legacy wallet activity, so coined words, likes, tips, rankings, and creator addresses remain attached to the same wallet.
- The normal app session and the optional 30-day OpenClaw/developer API session remain separate from the Sugarchain private key.

## Noverel and SweetWallet Foundation

Lingry is presented as a public-facing project from **Noverel™**, the parent brand that built **SweetWallet**. It extends that wallet foundation into a broader application for language, creativity, social discovery, and blockchain verification while retaining the underlying wallet capabilities.

## Ready-to-Use Project Website Copy

### One-line Summary

**Lingry is an AI-powered public lexicon for creating, discovering, and timestamping new words on Sugarchain.**

### Short Project Card

Lingry helps people turn missing ideas into new words. Generate with AI or start from your own prompt, then publish a compact, verifiable record on Sugarchain and share it through a live public word stream.

### Project Tags

- AI
- Blockchain
- Sugarchain
- Language Technology
- Web3
- Non-custodial Wallet
- Social Discovery
- Cloudflare Workers
- Public API
- Multilingual
