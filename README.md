# Agent Auth

Open-source implementations of the **[Agent Auth Protocol](https://agent-auth-protocol.com)**—authentication, capability-based authorization, and service discovery for AI agents that connect to your product.

Agents discover your service, register with a cryptographic identity, request capabilities, and run them. Sensitive actions stay behind user approval. The canonical specification is [nicepkg/agent-auth-protocol](https://github.com/nicepkg/agent-auth-protocol) on GitHub.

## Packages

| Package                                           | Description                   | Install                         |
| ------------------------------------------------- | ----------------------------- | ------------------------------- |
| [`@better-auth/agent-auth`](packages/agent-auth/) | Better Auth server plugin     | `npm i @better-auth/agent-auth` |
| [`@auth/agent`](packages/sdk/)                    | Client SDK for agent runtimes | `npm i @auth/agent`             |
| [`@auth/agent-cli`](packages/cli/)                | CLI and MCP server            | `npx @auth/agent-cli`           |

## Examples

Next.js reference apps under [`examples/`](examples/) integrate `@better-auth/agent-auth` with Drizzle:

- [`agent-deploy`](examples/agent-deploy/) — Baseline flow with email/password sign-in
- [`gmail-proxy`](examples/gmail-proxy/) and [`vercel-proxy`](examples/vercel-proxy/) — Same stack with **WebAuthn/passkeys** enabled (pick whichever structure fits your app)

The [`apps/`](apps/) directory contains internal applications (directory, desktop, browser extension) used in development and demos.

Additional packages and examples will be added over time.

## CI and releases

GitHub Actions (under [`.github/workflows/`](.github/workflows/)):

- **CI** — On pull requests and pushes to `main` / `canary`: **`pnpm fmt:check`** ([Oxfmt](https://oxc.rs/docs/guide/usage/formatter.html)), then install with a frozen lockfile and `turbo` **build**, **typecheck**, and **test** for [`packages/*`](packages/) only (published libraries), on Node **22.x** and **24.x** (see [`.nvmrc`](.nvmrc)). Format the tree locally with **`pnpm fmt`**.
- **Release** — Pushing a tag `v*` runs [changelogithub](https://github.com/antfu/changelogithub), builds the same packages, and runs `pnpm -r publish` to npm. **Required:** repository secret `NPM_TOKEN` with publish access. Tags matching `*-beta`, `*-rc`, `*-canary`, or `*-next` publish under that dist-tag; stable tags must point at a commit on `main` (or a `v*.*.x-latest` branch), matching the [Better Auth](https://github.com/better-auth/better-auth) release rules.
- **Preview** — Pull requests trigger [pkg-pr-new](https://github.com/stackblitz-labs/pkg.pr.new) for installable previews of `./packages/*`.
- **npm dist-tag** — Manual workflow to move a dist-tag on an existing version.

Optional: set `TURBO_TOKEN` and repository variable `TURBO_TEAM` (or rely on the default team) for [Vercel Remote Cache](https://turbo.build/repo/docs/core-concepts/remote-caching), same idea as Better Auth.

## License

[MIT](LICENSE)
