# inspix-hailstorm

This is a fork of https://github.com/vertesan/inspix-hailstorm. Thanks to the original author and contributors.

An all-in-one tool suite to analyze/decrypt Link Like Love Live resources and the master database, with a CLI and an experimental WebUI.

For the Chinese version, see `README.zh-CN.md`.

> Parts of the implementation are referenced from: https://github.com/AllenHeartcore/GkmasObjectManager

## Features

- Download and decrypt assets and the master database
- Database structure analysis mode for developers
- Experimental WebUI for browsing and search
- Docker workflow support

## Quick Start

You can build from source or run via container.

### Build from Source

```bash
go build .
```

After building, use `./hailstorm -h` for options. Common flags:

- No flags: download and decrypt all new assets and DB since the last run
- `--analyze`: analyze database structure for developers
- `--dbonly`: database only, skip assets
- `--web`: start WebUI (default `127.0.0.1:5001`)

### WebUI

Run from project root:

```bash
go run . --web --addr 127.0.0.1:5001
```

Or run after build:

```bash
./hailstorm --web --addr 127.0.0.1:5001
```

Open in browser: `http://127.0.0.1:5001`.

### WebUI Preview Extras

The WebUI can generate richer previews for some asset types when optional tools
are available:

- ACB audio preview: requires `vgmstream-cli` and `ffmpeg` in `PATH`.
  Preview output is cached under `cache/webui-preview/acb`.
- USM video preview (`.usm`): requires `ffmpeg` in `PATH`.
  WebUI auto transcodes to MP4 and caches under `cache/webui-preview/usm`
  (direct `.usm`) or next to exported files for AssetRipper outputs.
  USM often has no audio stream; if `vgmstream-cli` is also available, WebUI
  will try to extract companion audio from matching `bgm_live_*.acb` and mux it
  into the preview MP4.
  For quality/size efficiency, WebUI first tries stream-copy muxing
  (`h264 copy + aac copy` with timestamp fix). It falls back to
  `libx264` re-encode only when remux fails.
- Unity assetbundle preview: set `ASSETRIPPER_DIR` to your
  AssetRipper release folder (containing `AssetRipper.GUI.Free`).
  Inspix-hailstorm will start AssetRipper in headless mode and call its
  export API automatically. Output is cached under
  `cache/webui-preview/assetbundle/<label>`.
- If the WebUI shows "Export not configured", check:
  - Assetbundle export: `ASSETRIPPER_DIR` is set in your shell
    environment before launching the WebUI, and the binary exists.
  - ACB audio preview: `vgmstream-cli` and `ffmpeg` are available in `PATH`.
  - USM video preview: `ffmpeg` is available in `PATH`.
    For auto companion audio, `vgmstream-cli` is also needed.

Example (set AssetRipper directory):

```bash
export ASSETRIPPER_DIR="/path/to/AssetRipper_release_folder"
```

Notes:
- AssetRipper uses `--port` (default 23600) when started by inspix-hailstorm.
- Preview output is derived from `cache/plain`; ensure the plain cache exists.

Detailed steps:

Assetbundle export (AssetRipper GUI Web)
1) Install AssetRipper from the official releases and locate `AssetRipper.GUI.Free`.
2) Set `ASSETRIPPER_DIR` to the release folder.
3) Generate `cache/plain` with inspix-hailstorm (run a normal update or convert mode) so the assetbundle file exists.
4) Start inspix-hailstorm with WebUI; it will launch AssetRipper headless and
   call `/LoadFile` and `/Export/PrimaryContent` automatically.
   Reference: https://github.com/AssetRipper/AssetRipper/blob/master/Source/AssetRipper.GUI.Web/WebApplicationLauncher.cs

Notes:
- AssetRipper rejects export paths that are system directories (Desktop/Documents/Downloads).
- `--headless` avoids launching the browser. `--port` is supported by AssetRipper GUI Web.

ACB audio preview
1) Install `vgmstream-cli` and `ffmpeg` and ensure both are in `PATH`.
2) Use "Export & Preview" on an `.acb` entry.

USM video preview
1) Install `ffmpeg` and ensure it is in `PATH`.
2) For direct `.usm` entries, open the entry view (or click "Export & Preview")
   to generate `cache/webui-preview/usm/<label>.mp4`.
3) For `.usm` files exported from AssetRipper inside assetbundle output,
   WebUI will auto-generate `<file>.usm.preview.mp4` next to the source file.
4) If a matching `bgm_live_<id>01.acb` (or fallback `bgm_preview_<id>01.acb`)
   exists and `vgmstream-cli` is available, preview generation will extract
   audio from ACB and mux it into the MP4.
5) If output size is much larger than source USM + companion audio, remux likely
   failed and fallback `libx264` path was used for compatibility.

### Docker

Image:
https://github.com/vertesan/inspix-hailstorm/pkgs/container/inspix-hailstorm

Run `run_docker.sh` to start the container.
Defaults to `dbonly`; override via docker CLI `--entrypoint` if needed.

## References & Thanks

- https://github.com/vertesan/inspix-hailstorm
- https://github.com/AllenHeartcore/GkmasObjectManager
- https://github.com/AssetRipper/AssetRipper

## License

AGPL-3.0
