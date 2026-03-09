# AGENTS.md

## SugarChain Web Wallet

This file provides instructions for AI coding agents (Codex Agent Mode) working in this repository.
Agents should follow these rules when modifying or extending the SugarChain web wallet.

---

## 1. Project Overview

This repository contains the SugarChain Web Wallet.
The wallet runs locally at:

`http://localhost:8080/#/`

The wallet already implements:
- wallet authentication
- wallet address management
- SugarToken balance display
- blockchain connectivity
- transaction handling
- wallet UI and navigation

Agents must extend the existing wallet, not rebuild it.

---

## 2. Development Goals

Agents may be asked to implement new features such as:
- wallet UI enhancements
- new wallet tabs
- blockchain utilities
- game integrations
- developer tools

Agents must ensure:
- wallet functionality remains intact
- blockchain logic is not broken
- UI remains responsive and mobile-friendly

---

## 3. Architecture Principles

### Extend existing code
Do not replace major wallet components.
Reuse existing modules whenever possible.

Preferred approach:
- extend
- compose
- add new components

Avoid:
- rewriting wallet logic
- changing blockchain transaction flow
- removing wallet authentication

---

## 4. Wallet Balance Rules

The wallet balance displayed in the UI must always reflect actual blockchain state.
Agents must never modify wallet balances artificially.
Game features must use temporary in-memory balances only.
Wallet balance sources must come from the wallet's existing balance provider.

---

## 5. Games System

This project includes a Games tab that may contain browser-based games.
Games must follow these rules:

### Entertainment Only
Games must not change blockchain balances.
Gameplay must use a temporary game balance.

Game balance behavior:
- `walletBalance = real wallet balance`
- `gameBalance = walletBalance`

During gameplay:
- `gameBalance` changes
- `walletBalance` stays unchanged

Session reset:
- `gameBalance` resets to `walletBalance`

---

## 6. UI Guidelines

The wallet UI must remain mobile-friendly.
Target layout:

`1080 x 1920 portrait`

Use:
- responsive CSS
- flexible layouts
- scalable UI components

Preferred techniques:
- flexbox
- CSS grid
- responsive scaling

---

## 7. Blackjack Game UI (Current Feature)

The Games tab currently includes a Blackjack game.

Requirements:

### Visual Style
- classic casino style
- green felt table
- traditional playing cards
- large readable cards

Cards must be easily readable on mobile.
Animations should be minimal.

### Game Controls
Required controls:
- Bet
- Hit
- Stand
- New Hand

Optional controls:
- Double
- Split

Buttons must be touch friendly.
Minimum height:

`48px`

---

## 8. Game Logic

Games should use standard blackjack rules.

Typical functions:
- `initializeDeck()`
- `shuffleDeck()`
- `startGame()`
- `dealCard()`
- `calculateHandValue()`
- `playerHit()`
- `playerStand()`
- `dealerTurn()`
- `resolveRound()`
- `resetRound()`

Game state should be stored in browser memory only.
Never persist gameplay to the blockchain.

---

## 9. Sound System

Games may include sound effects.

Examples:
- win sound (casino cash)
- loss sound (mild disappointment)

Audio formats:
- mp3
- ogg

Audio files should be lightweight.

---

## 10. Code Organization

Games should live inside a dedicated folder.

Example structure:

```text
/games
    blackjack.js
    blackjack.css
    blackjack.html

/assets/cards
/assets/sounds
```

Reusable components should go inside:

`/components`

---

## 11. Performance Rules

Agents should optimize for mobile performance.

Guidelines:
- minimize animations
- use SVG card assets
- compress images
- lazy load sounds

---

## 12. Code Quality

Agents should:
- write readable code
- add clear comments
- avoid unnecessary dependencies
- prefer simple solutions

Prefer:
- vanilla JavaScript

Frameworks may be used if the project already includes them.

---

## 13. Safe Changes

Agents must avoid modifying:
- wallet authentication logic
- blockchain transaction handlers
- core wallet state management

Changes should focus on:
- UI layers
- new features
- game modules
- components

---

## 14. Recommended Workflow for Agents

When implementing a feature:
1. Explore the repository structure
2. Identify relevant UI components
3. Extend navigation if needed
4. Add new modules under appropriate directories
5. Ensure wallet state is not modified incorrectly
6. Test UI responsiveness
7. Provide a clear file diff

---

## 15. Expected Output

Agents should present results as:
- file diffs
- new files
- modified files

Explain major architectural changes when necessary.

---

## 16. Guiding Principle

This project is a real cryptocurrency wallet.
Games are for entertainment only.

Agents must ensure:
- blockchain balances remain accurate
- wallet functionality remains stable
