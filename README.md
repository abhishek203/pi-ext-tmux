# @abhishek203/pi-ext-tmux

A Pi extension package that shows tmux status in a right-aligned widget above the typing bar.

## Features

- shows `tmux: N` above the input area
- shows tmux session names below the count
- refreshes automatically every 5 seconds

## Package layout

```text
.
├── CHANGELOG.md
├── README.md
├── package.json
└── tmux-status.ts
```

This repo is packaged as a Pi package via `package.json`:

```json
{
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["tmux-status.ts"]
  }
}
```

## Requirements

- `tmux` installed and available on `PATH`
- Pi with extension support

## Install

### From a local checkout

```bash
pi install /absolute/path/to/pi-ext-tmux
```

Or from the repo directory:

```bash
pi install .
```

### From GitHub

Users can install it with:

```bash
pi install git:github.com/abhishek203/pi-ext-tmux
```

To pin a version or tag:

```bash
pi install git:github.com/abhishek203/pi-ext-tmux@v0.1.0
```

### From npm

After publishing to npm:

```bash
pi install npm:@abhishek203/pi-ext-tmux
```

### Temporary test

```bash
pi -e ./tmux-status.ts
```

## Reload

If Pi is already running:

```text
/reload
```

## Usage

### Widget

Shows a right-aligned widget above the typing bar, for example:

```text
                           tmux: 2
               session-one
               session-two
```

## What it reports

- whether `tmux` is installed
- number of tmux sessions
- session names

## Development notes

This package follows the Pi extension/package docs:

- extensions are declared through the `pi.extensions` manifest in `package.json`
- core Pi packages are listed in `peerDependencies`
- the extension exports a default `ExtensionAPI` factory

## License

MIT. See [LICENSE](./LICENSE).

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).
