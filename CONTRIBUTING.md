# Contributing to medai-os

Thanks for your interest in contributing! MedAI Imaging Operating System
(medai-os) is an open-source medical imaging viewer. This guide covers how to
get set up and what we expect in a contribution.

## Ground rules

- **No patient data, ever.** Never commit DICOM/NIfTI files, real studies, or
  any protected health information (PHI). Sample data is downloaded on demand
  and is gitignored.
- **No secrets.** API keys, credentials, and server hostnames belong in
  `.env` files (gitignored), never in tracked source. CI runs secret scanning
  on pull requests.
- **Research use only.** MedAI is not a medical device; do not add claims,
  defaults, or docs that imply clinical/diagnostic fitness.

## Development setup

```bash
# Frontend
cd medai-viewer
pnpm install
pnpm dev          # http://localhost:3000

# Checks (run before opening a PR)
pnpm lint
pnpm typecheck
pnpm build
```

For backend work, see [`MedAI-server/`](MedAI-server/) and the compose profiles
described in the [README](README.md).

## Adding a feature behind a flag

Optional capabilities must be gated so the basic viewer keeps working with zero
setup:

1. Add the feature id to `medai-viewer/packages/core/src/features/types.ts` and
   register it in `registry.ts`.
2. Gate its UI (tabs/panels/routes), hooks, and service calls with
   `isFeatureEnabled('your-feature')`. Suite tabs/panels can declare
   `requiredFeatures`.
3. If it needs a backend, add the service under the appropriate docker-compose
   profile and document the pairing in the README's feature matrix.
4. Verify the basic viewer (`VITE_FEATURES=` empty, no backend) still boots and
   makes no network calls for your feature.

## Pull requests

- Keep changes focused; match the surrounding code style.
- Include a clear description and testing notes.
- Ensure `pnpm lint && pnpm typecheck && pnpm build` pass.

## License

By contributing, you agree that your contributions are licensed under the
Apache License 2.0 (see [LICENSE](LICENSE)).
