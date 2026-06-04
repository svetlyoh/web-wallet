# Dragon's Egg (Authentic Mode Notes)

This module is a fixed-segment LCD-style recreation for the Games tab.

## Authentic movement model

- Character movement is discrete and position-based (no interpolation).
- RUN and BACK each move exactly one predefined position per press.
- JUMP swaps through predefined airborne segment states.
- Dragon threat animation is pose switching only (no roaming AI pathfinding).
- Egg and obstacle states are switched between predefined segment positions.

## Failure behavior

- Failure uses dedicated caveman fail segments (shock/fallen state).
- A jagged LCD-style impact burst segment appears near the head.
- Failure pauses progression for a short two-step recovery sequence.
- A short LCD-style fail beep is emitted with WebAudio when supported.

## Stage display behavior

The upper-right LCD counter includes:

- `SCORE` as a four-digit counter (`0000` to `9999`)
- stage indicator in `major-minor` format (for example `1-1`, `1-2`)

Implemented progression:

- game starts at `1-1`
- after each successful egg deposit, stage alternates `1-1 -> 1-2`
- after `x-2`, major stage increments and minor resets (`2-1`, `2-2`, ...)

This keeps the staged LCD-counter feel while remaining faithful to fixed-segment rendering.
