# Release packaging

- User distribution uses one Windows NSIS installer: `release/METech-desktop-assistant-Setup-${version}.exe`.
- Build with `npm run dist`. Do not build a portable version, ZIP an installer, create a differently named installer copy, or copy installers to the desktop.
- Keep only the current installer in `release`; remove obsolete or duplicate distribution installers after the replacement has been verified.
- Keep `latest.yml`, the installer `.blockmap`, release notes and checksum files needed for automatic updates and verification. They are supporting files, not additional installers.
- `win-unpacked` is internal build output. Never remove application source, user settings, organizer files or an installed/running assistant while cleaning release artifacts.
- Preserve the user's requested version. Publish release assets only when authorized by the user. For a release revision, remove extra installer formats from that release and update its metadata to match the single verified installer.
- `npm run dist` signs `release/latest.yml` (`metechSignature`) with the offline update key; see `docs/update-signing.md`. Never publish an unsigned `latest.yml`, and never copy the private key into the repository.
