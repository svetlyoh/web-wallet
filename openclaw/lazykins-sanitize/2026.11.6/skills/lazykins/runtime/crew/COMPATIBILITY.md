# Command Deck crew source preservation and compatibility

The supplied extracted Helm v1.1 and crew v1.0 distribution directories are preserved byte-for-byte under `originals/`, including their manifests, authored instructions and both PNG/SVG avatar artwork. Every supplied manifest entry matched its SHA256 and size before copying. Original ZIPs were not present; no ZIP provenance is claimed.

`sources/` contains per-agent source projects for exact OpenClaw 2026.11.6. Every file except `CLAW.md` is byte-identical to the corresponding author source. In `CLAW.md` only, unsupported `agent.emoji` / `agent.theme` move to native `agent.identity`; name and the already supplied workspace-relative avatar are explicitly bound in that same identity. Empty `skills`/`plugins` become native `packages: []`; empty `automations` becomes `cronJobs: []`. All selected original workspace files, including the supplied SVG avatar, remain selected. JSON frontmatter is valid YAML and avoids a build-time Python YAML dependency.

The redundant CLAW Markdown body is omitted in the compatibility project because the native reader rejects a body together with an explicit `SOUL.md` workspace declaration. The full original body remains in `originals/`. The original workspace `SOUL.md`, `AGENTS.md`, identity, user, references and artwork are not rewritten. In particular, no delegated-run persona fix is assumed without a real model test.

Native build/validation receipts are produced by `scripts/build_crew.py` from the exact pinned source. Generated `.tgz` files contain one agent each; the outer combined skill ZIP is not a native Template.

## Supported setup on 2026.11.6

The authenticated Gateway's `templates.add.plan/apply` accepts only a ClawHub package coordinate in this release. `templates.status` is not a live handler in the pinned release despite a retained protocol schema, and native local Add is stateless rather than a version-managed installation. Discovery must use the real agent roster and reviewed workspace fingerprints; a matching ID by itself never establishes authorship. Its Control UI has no local Template .tgz upload review. Do not send a local path/URL or invent an archive-upload RPC. The bundled .tgz downloads are portable build artifacts; the host-side local source folders are the supported Add input.

Template Add is explicitly offline-only in this release: stop the selected Gateway through its existing service owner and wait for ownership to release before local Add. Do not run an offline importer against a live Gateway. Templates must already be owner-enabled in Settings > Labs; this package does not toggle Labs.

From the transferred runtime folder, independently review each wanted addition while the selected Gateway is stopped:

```bash
openclaw --profile default templates validate ./crew/sources/helm-template --json
openclaw --profile default templates add ./crew/sources/helm-template --agent-id helm --dry-run
# Review the plan, requested ID, workspace and proposed effects. Then, only if approved:
openclaw --profile default templates add ./crew/sources/helm-template --agent-id helm
```

Repeat separately for `jace` and `cruz` if desired, substituting the respective source folder and ID. The native Add command retains its own review/consent. It may refuse existing IDs or choose an unused ID: re-query the roster and verify the actual returned ID, never repeat Add blindly. This distribution does not grant delegation, change main/default agents, add channels/models/plugins/jobs or overwrite any existing agent. Restart the original service after approved additions. Existing name conflicts or modified authored files need owner review, not automatic repair. Removing or disabling Command Deck never deletes crew workspaces or history.

Native validation also rejects USER.md in the bootstrapFiles map. The compatibility CLAW moves its unchanged source into workspace.files with destination USER.md, the native-supported form. The USER.md bytes are not changed.
