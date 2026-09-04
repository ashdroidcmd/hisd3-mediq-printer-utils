# Changelog

## 2026-09-04 — Hardening pass (parity with mediq-print-linux/new.js)

### Changed
- Added structured logging: a `log()` helper with a `DEBUG` flag (`--debug`
  flag or `DEBUG=true` env var) and timestamps, replacing ad-hoc
  `console.log`/`console.error` calls. Verbose per-step connection logs
  (`✓ Device opened`, `✓ Interface claimed`, etc.) are now debug-only.
- Replaced `POST /debug/configure` with a `GET /config` / `POST /config`
  pair. `POST /config` now validates `vendorId`/`productId` as hex strings
  before accepting them — previously an invalid value silently became `NaN`
  and broke device matching with no error.
- `POST /print` no longer requires `priorityName` — only `queueNumber`,
  `departmentName`, `serviceName` are required. It remains optional and is
  only used for logging (it was never in the printed receipt text).
- `POST /print` and `POST /test-print` success responses now include
  `method` and `bytes` fields.
- `POST /print`'s error response `troubleshooting` field is now an array of
  strings instead of one long string.

### Removed
- Removed `printViaWindowsSpooler()` — a dead function (the `/print` route
  never actually reached it) that built a shell command with the request
  body's `printerName` interpolated directly into `exec()`, a command
  injection hole. This mirrors the same class of fix already made in
  `mediq-print-linux/new.js`'s sudo fallback (shell string via `execSync` →
  `spawnSync` with an argv array).
- Removed `setup.ps1`, `setup.sh`, `QUICK_START.md`,
  `IMPLEMENTATION_SUMMARY.md` — superseded by `PRINTER_README.md`.
