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

### Added

- Extraction eval set with 44 cases, run by hand with `pnpm eval:ia`.
- Versioned extraction prompt (v1 to v5), with v5 in use.
- `/resumo AAAA-MM` summarizes any month straight from the database, without
  calling the AI.
- Emoji per category in bot replies.
- Semantic versioning: this changelog, the `vX.Y.Z` tag and GitHub Release
  created on merge to `main`, the `:vX.Y.Z` image tag, and a CI check that
  release pull requests bump the version and add its changelog section.

### Changed

- Bot replies are sent as HTML, with escaping centralized in one place.
- An `Html` type keeps unescaped text out of bot replies at compile time.
- Summary percentages are whole numbers that add up to 100% (largest
  remainder method); the Markdown export shows whole percentages too.
- `maxOutputTokens` for Gemini raised to 2048.
- Bot commands are registered with `setMyCommands` only in the owner's chat.

### Fixed

- Migrations run without logging every query.
- The Undo popup is plain text, so failures no longer show raw markup.

### Security

- Prompt delimiters are matched after NFKC normalization, so look-alike
  Unicode characters cannot close the user-message block.

[Unreleased]: https://github.com/augustobernardo/economizaAi/commits/develop
