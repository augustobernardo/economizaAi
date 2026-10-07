# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html):
`MAJOR` for incompatible changes (commands, data or environment variables),
`MINOR` for new backwards-compatible features and `PATCH` for fixes. While the
version is `0.y.z`, the public surface is not considered stable.

The `develop → main` release pull request bumps `version` in `package.json`
and moves `[Unreleased]` to `[x.y.z] - YYYY-MM-DD`. The merge on `main`
creates the `vX.Y.Z` tag, the GitHub Release and the `:vX.Y.Z` image.

## [Unreleased]

## [0.1.0] - 2026-10-06

### Added

- Extraction eval set with 44 fictional cases (11 held out), run by hand with
  `pnpm eval:ia`, outside CI.
- Versioned extraction prompt (v1 to v5): category definitions, rules for
  amounts and relative dates, few-shot examples and schema field
  descriptions. v5 is in use.
- `/resumo AAAA-MM` summarizes any month straight from the database, without
  calling the AI.
- Emoji per category in bot replies.
- Bot commands in the Telegram menu (`setMyCommands`), shown only in the
  owner's chat.
- Semantic versioning: this changelog, the `vX.Y.Z` tag and immutable GitHub
  Release created on merge to `main`, the `:vX.Y.Z` image tag, and a CI check
  that release pull requests bump the version and fill this changelog.

### Changed

- Bot replies are sent as Telegram HTML, with user, transcript and LLM text
  escaped in one place.
- Summary percentages are whole numbers that add up to 100% (largest
  remainder method); the Markdown export shows whole percentages too.
- The Undo failure popup is a fixed plain-text message.
- Bot replies use no em dash.

### Fixed

- Migrations run without logging every query.

### Security

- An `Html` type makes unescaped text in a bot reply a compile error, and CI
  now type-checks specs so those type tests are enforced.
- Unsafe `any` arguments and assignments are lint errors in production code.
- Gemini output is capped at 2048 tokens.
- Prompt delimiters are matched after NFKC normalization, so look-alike
  Unicode characters cannot close the user-message block.
- The release image is scanned for embedded secrets before it is published.

[Unreleased]: https://github.com/augustobernardo/economizaAi/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/augustobernardo/economizaAi/releases/tag/v0.1.0
