# Command Deck Helm R7 implementation report

Target: OpenClaw 2026.11.6, upstream 06afb10d3272cc9deaf38ca6a3b7b839d5935638. This is a pinned UI distribution, not an OpenClaw engine upgrade. No live Ubuntu service was connected during implementation.

## Included and adapted

Helm 1.1 and Jace/Cruz 1.0 source distributions are bundled locally. All 44 supplied original files are preserved byte-for-byte under runtime/crew/originals; source-inventory.json and source-receipts.json record hashes. Only adapted CLAW manifests differ: native identity schema, explicit empty package/cron collections, removal of conflicting redundant body, and USER.md mapped as a workspace file rather than an unsupported bootstrap key. Authored workspace files and avatar artwork are unchanged. Original archive containers were not supplied.

## Integration and authorization

Separate Command Deck navigation restores ordinary main selection and keeps per-Gateway/operator selected/default preferences. Crew discovery reads agents.list and agents.files.get bootstrap hashes, plus available same-origin avatar bytes. It detects conflicts and retains actual IDs of uniquely verified renamed agents. It does not adopt matching IDs alone.

No browser-side local Template Add API exists in this release. Each card provides native per-agent package downloads and a reviewed host-side fallback. Owner enables Labs Templates independently. Native templates validate/inspect and Add dry-run/application require the selected Gateway stopped. No automatic agent additions, model choices or background tasks occur.

Delegation is a separate explicit review using config.get and hash-guarded config.patch. Only verified Jace/Cruz IDs are added; inherited/explicit existing grants are preserved, including wildcard no-op. Auth changes and stale config reject the write. Configured targets do not certify effective model tool policy.

Direct chats use native selection/router/session owners and chat.send. Activity uses native child-session and provider-native observations; no fabricated scheduler or status. Exit disables only the mode; agents, history and grants remain. Full UI-root rollback uses lazykinsctl.py off. Revoke reviewed delegation separately using the recorded prior override/inheritance state.

## Acceptance coverage and limits

| Test | Evidence / remaining host check |
| --- | --- |
| A1 fresh zero crew | Production browser fixture checks proposed cards and zero automatic creation/config writes. Actual owner-approved creation remains a host check. |
| A2 installed crew | Native Template validation/build and synthetic authenticated roster/hash admission. Real separate host workspaces remain a host check. |
| A3 default isolation | Production browser fixture covers main -> Helm -> Jace -> exit main -> reenter Jace, draft preservation and cold reload. No global default writes. |
| A4 roster | Production browser fixture checks original-avatar crew and other agents; screenshots supplied. |
| A5 direct Jace | Browser fixture asserts chat.send targets agent:jace:main. Real model response and authored voice untested. |
| A6 direct Cruz | Browser fixture asserts chat.send targets agent:cruz:main. Real model response and authored voice untested. |
| A7 Jace delegation | Native activity projection and explicit grant mechanics covered synthetically. Real provider spawn/result untested. |
| A8 Cruz delegation | Same limits as A7; no claim of a real run. |
| A9 delegated persona | Unverified; original files preserved and no speculative personality patch applied. Test direct and delegated voices on the host. |
| A10 denied permissions | Production owner proof covers authorization changes and stale hashes. Full live model denial behavior remains a host check. |
| A11 conflicts/idempotency | Production owner proof checks ID conflicts, renamed/ambiguous identity and no automatic additions. Native repeated Add is intentionally never automatic. |
| A12 unsupported APIs | Exact-version source inspection selects documented offline host fallback; no invented Template status/upload RPC. |
| A13 lifecycle | Browser fixture uses native production owner with synthetic running-to-completed child event. Real provider cancellation/error lifecycle remains unverified. |
| A14 no collateral changes | Browser fixtures check no creation/config writes on mode entry; controllers verify targeted owned changes. No live host collateral audit claimed. |
| A15 quiet/reversible | Templates contain no package/MCP/cron jobs; mode exit and controller rollback covered. Actual host service restart remains operator action. |

The release guide contains exact setup and rollback commands. Native original-hash receipts, Template build receipts, browser observations and screenshot evidence are included in the transfer archive. These fixtures run the production UI against a synthetic authenticated Gateway; they do not certify paid/provider-backed model behavior.

## Final release evidence

Final production build: https://github.com/svetlyoh/web-wallet/actions/runs/44958145167
Package source commit: 972ce21 (later release-documentation commits do not change the runtime).

44 Linux controller/preservation tests passed. All three native Template sources validated and built. Production-owner authorization proofs passed, including inherited allowlists, wildcard preservation, stale CAS and authorization changes. The production browser fixture passed all three modes, direct Jace/Cruz sends, native child activity, ordinary main draft/selection restoration, Command Jace reentry and cold reload, with no crew-page runtime errors. Screenshot review found and corrected roster row overlap; the final browser geometry check confirms all three rows are at least 60px and do not overlap.

Native startup/chat performance ceilings remain unchanged and passed. Review source maps are generated hidden and omitted from transfer payloads. Gzip level 12 is retained only when smaller than native level 11; every recompressed asset is decoded and compared to its original executable bytes.

Transfer archive: LazyKins-CommandDeck-Helm-2026.11.6-r7.zip
SHA-256: 3de460bd931485712f318a1a6b9d58ed15fbd879bc75291b88896d02febedd5b
All 5,568 transfer checksums and 5,393 UI payload checksums verified after download; all three ZIP archives passed CRC inspection. Exactly two skill entry points are included: LazyKins and Sanitize. Helm/Jace/Cruz are separately reviewed agent Templates.

## Source diff map

Exact pinned native patch files, with original/patched hashes in runtime/patches/integration-contract.json:

- `ui/src/app/app-shell-view-state.ts`
- `ui/src/app/app-shell-view.tsx`
- `ui/src/app/settings.ts`
- `ui/src/components/app-sidebar-base.ts`
- `ui/src/components/app-sidebar-owner.tsx`
- `ui/src/components/app-sidebar-rail.tsx`
- `ui/src/components/app-topbar-solid.tsx`
- `ui/src/pages/chat/components/chat-composer-controls.tsx`
- `ui/vite.config.ts`

Owned runtime/ui files add the crew catalog/discovery owner, setup cards, roster, Command navigation preferences and storage adapter, mode surface and Helm delegation bar. The build_crew.py/native_crew_build.mts helpers validate and build the preserved local Template projects. compress-ui.mts improves precompression with byte-identity checks. verify-crew-owner.mts and verify-ui.mts contain the authorization and production browser proofs. User-facing setup and rollback are in docs/COMMAND-DECK-HELM.md and docs/OPERATOR-GUIDE.md.

No live Ubuntu agent creation, real model response, provider-backed spawn/result or delegated persona behavior is certified by this release.
