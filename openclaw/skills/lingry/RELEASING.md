# Releasing the Lingry skill

The source of truth for the version is `openclaw/skills/lingry/package.json`. Keep the `SKILL.md` frontmatter and `INSTALL.json` version equal to it; the release build enforces this. The staged `package.json` is generated without development scripts or dependencies.

## Publishing to ClawHub

From the repository root:

```bash
npm test
npm run build:clawhub
node dist/clawhub-lingry/bin/lingry-agent.mjs verify-install
```

The exact manual upload directory is `dist/clawhub-lingry/`. It contains only `SKILL.md`, `README.md`, `INSTALL.json`, `package.json`, `bin/lingry-agent.mjs`, and `src/runtime.mjs`. The build also synchronizes the byte-identical, source-controlled `skills/lingry/` folder. For ClawHub's **Import from GitHub** flow, sign in with the GitHub account that owns `svetlyoh/web-wallet`, select that public repository, and choose `skills/lingry/`—not the development folder `openclaw/skills/lingry/`. The GitHub importer only discovers skills in public, non-fork repositories owned by the signed-in account. Alternatively use the ClawHub website's folder uploader for `dist/clawhub-lingry/`, or publish that exact folder with the CLI and its current owner/version flags (for example, `clawhub skill publish dist/clawhub-lingry --slug lingry --version <version>`). Publication is a separate, manual owner action; this build does not upload anything.

## Release checklist

1. Update `package.json`'s version, then `SKILL.md` and `INSTALL.json` to match.
2. Run the full test suite and the security tests in `openclaw/skills/lingry/test/`.
3. Run `npm run build:clawhub` and inspect every file in `dist/clawhub-lingry/`, `skills/lingry/`, and `dist/clawhub-lingry-manifest.json`; the two folders must match.
4. Run `verify-install` against the staged folder. It must make no network call or publication.
5. Verify the generated `dist/lingry-skill-<version>.zip` extracts to one `lingry/` folder and matches the staged file hashes. The package-equivalence test does this automatically.
6. Check the ZIP, `.sha256`, and versioned `.manifest.json`; review `SKILL.md` installation directions.
7. Confirm tests, development files, `.lingry` state, wallet files, private keys, and credentials are absent from the staged folder and ZIP.
8. Push the clean `skills/lingry/` folder to GitHub. In ClawHub, import that folder from `svetlyoh/web-wallet`, manually upload `dist/clawhub-lingry/`, or use the ClawHub CLI for that exact staged directory.
9. Wait for ClawHub's security scan and confirm its displayed version matches the package metadata.
10. Create and push the deliberate `lingry-v<version>` Git tag. Run the `Lingry portable release` GitHub Actions workflow with that tag (or attach the three generated assets manually). Confirm the release assets and ClawHub listing have the same version.

The GitHub workflow does not run on ordinary commits. It requires an existing tag and verifies that the tag matches the checked-out package version before creating a release. The [GitHub Releases page](https://github.com/svetlyoh/web-wallet/releases) is the stable portable-download location.
