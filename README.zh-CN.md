# inspix-hailstorm

本项目为 https://github.com/vertesan/inspix-hailstorm 的 fork，感谢原作者与贡献者。

用于解析连结喜欢爱生活资源与主数据库的一体化工具套件，包含命令行与试验性 WebUI。

英文版本请见 `README.md`。

> 部分实现参考了项目：https://github.com/AllenHeartcore/GkmasObjectManager

## 功能概览

- 资源与主数据库的下载、解密
- 数据结构分析模式（面向开发者）
- 试验性 WebUI 浏览与检索
- Docker 运行方式

## 快速开始

你可以自行从源码构建，或使用容器运行。

### 源码构建

```bash
go build .
```

构建完成后可用 `./hailstorm -h` 查看参数说明，常用参数：

- 无参数：下载并解密自上次运行以来的所有新资源与数据库
- `--analyze`：开发者分析数据库结构
- `--dbonly`：仅处理数据库，不下载资源
- `--web`：启动 WebUI（默认地址 `127.0.0.1:5001`）

### WebUI

项目根目录下启动：

```bash
go run . --web --addr 127.0.0.1:5001
```

或构建后运行：

```bash
./hailstorm --web --addr 127.0.0.1:5001
```

打开浏览器访问：`http://127.0.0.1:5001`。

### WebUI 预览增强

当可选工具可用时，WebUI 支持更丰富的资源预览能力：

- ACB 音频预览：需要 `vgmstream-cli` 与 `ffmpeg` 已加入 `PATH`。
  预览输出缓存于 `cache/webui-preview/acb`。
- USM 视频预览（`.usm`）：需要 `ffmpeg` 在 `PATH` 中。
  WebUI 会自动转码为 MP4；直接 `.usm` 缓存于 `cache/webui-preview/usm`，
  AssetRipper 导出产物则在导出目录内生成派生 MP4。
  USM 通常不包含音轨；若同时提供 `vgmstream-cli`，WebUI 会尝试从匹配的
  `bgm_live_*.acb` 中抽取音频并混流到预览 MP4。
  为兼顾画质与体积，WebUI 会优先尝试直封装（`h264 copy + aac copy` 并修正
  时间戳）；仅在封装失败时回退到 `libx264` 重编码。
- Unity assetbundle 预览：设置 `ASSETRIPPER_DIR` 为 AssetRipper
  发行版目录（包含 `AssetRipper.GUI.Free`）。Inspix-hailstorm 会以 headless
  模式启动 AssetRipper 并自动调用导出接口，输出缓存于
  `cache/webui-preview/assetbundle/<label>`。
- 如果 WebUI 提示 “Export not configured”，请检查：
  - Assetbundle 导出：确认在启动 WebUI 前已设置 `ASSETRIPPER_DIR`，
    且二进制文件存在。
  - ACB 预览：确保 `vgmstream-cli` 与 `ffmpeg` 在 `PATH` 中可用。
  - USM 预览：确保 `ffmpeg` 在 `PATH` 中可用。
    若需自动补音频，还需 `vgmstream-cli`。

示例（设置 AssetRipper 目录）：

```bash
export ASSETRIPPER_DIR="/path/to/AssetRipper_release_folder"
```

补充说明：
- inspix-hailstorm 启动 AssetRipper 时使用 `--port`（默认 23600）。
- 预览输出来自 `cache/plain`，请确保已生成解密缓存。

详细步骤：

Assetbundle 导出（AssetRipper GUI Web）
1) 从官方发行版安装 AssetRipper 并找到 `AssetRipper.GUI.Free`。
2) 设置 `ASSETRIPPER_DIR` 为发行版目录。
3) 先使用 inspix-hailstorm 生成 `cache/plain`（常规更新或 convert 模式），确保存在 assetbundle 文件。
4) 启动 inspix-hailstorm 的 WebUI；会自动 headless 启动 AssetRipper 并调用
   `/LoadFile` 与 `/Export/PrimaryContent`。
   参考上游源码：
   https://github.com/AssetRipper/AssetRipper/blob/master/Source/AssetRipper.GUI.Web/WebApplicationLauncher.cs

注意：
- AssetRipper 不允许导出到系统目录（Desktop/Documents/Downloads）。
- `--headless` 可避免自动打开浏览器；`--port` 为 AssetRipper GUI Web 支持的端口参数。

ACB 音频预览
1) 安装 `vgmstream-cli` 与 `ffmpeg`，确保在 `PATH` 中。
2) 在 `.acb` 条目上点击“导出并预览”。

USM 视频预览
1) 安装 `ffmpeg`，并确保在 `PATH` 中可执行。
2) 对直接 `.usm` 条目，打开条目详情页（或点击“导出并预览”）后会生成
   `cache/webui-preview/usm/<label>.mp4`。
3) 对 AssetRipper 导出结果中的 `.usm` 文件，WebUI 会在同目录自动生成
   `<file>.usm.preview.mp4`。
4) 若存在匹配的 `bgm_live_<id>01.acb`（或回退 `bgm_preview_<id>01.acb`），
   且 `vgmstream-cli` 可用，预览会自动从 ACB 抽取音频并混入 MP4。
5) 若输出体积明显大于源 USM + 补充音频，通常表示直封装失败并回退到了
   `libx264` 兼容路径。

### Docker

镜像地址：
https://github.com/vertesan/inspix-hailstorm/pkgs/container/inspix-hailstorm

运行 `run_docker.sh` 启动容器。
默认以 `dbonly` 模式执行，如需更改可通过 docker CLI 传入 `--entrypoint` 覆盖。

## 参考与致谢

- https://github.com/vertesan/inspix-hailstorm
- https://github.com/AllenHeartcore/GkmasObjectManager
- https://github.com/AssetRipper/AssetRipper

## License

AGPL-3.0
