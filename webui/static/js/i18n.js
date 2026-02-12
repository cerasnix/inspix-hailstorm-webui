window.I18n = (() => {
  const strings = {
    en: {
      "nav.overview": "Overview",
      "nav.search": "Search",
      "nav.masterdata": "Masterdata",
      "nav.searchPlaceholder": "Search label, type, or crc",
      "footer.tagline": "Local tools, local data.",
      "home.heroEyebrow": "Manifest cockpit",
      "home.heroTitle": "Pull, decrypt, parse. All in one place.",
      "home.heroSubtitle":
        "Launch updates, conversions, and masterdata builds without leaving the browser. Everything runs on your local cache.",
      "home.browseCatalog": "Browse catalog",
      "home.status": "Status",
      "home.statusVersion": "Version",
      "home.statusCatalog": "Catalog",
      "home.statusDb": "DB Entries",
      "home.statusPlain": "Plain Cache",
      "home.statusAssets": "Raw Cache",
      "home.statusMaster": "Masterdata",
      "home.runTask": "Run a task",
      "home.queue": "Queue",
      "home.taskMode": "Mode",
      "home.taskOption.update": "Update (download + parse)",
      "home.taskOption.dbonly": "Update DB only",
      "home.taskOption.convert": "Convert (decrypt existing)",
      "home.taskOption.master": "Masterdata (parse existing)",
      "home.taskOption.analyze": "Analyze only",
      "home.taskClientVersion": "Client Version",
      "home.taskClientVersionPlaceholder": "Optional",
      "home.taskClientVersionHelp": "Leave blank to auto-detect.",
      "home.taskResInfo": "Resource Info",
      "home.taskResInfoPlaceholder": "Optional",
      "home.taskResInfoHelp": "Leave blank to auto-fetch.",
      "home.taskFilterRegex": "Filter Regex",
      "home.taskFilterRegexPlaceholder": "e.g. bgm_.*",
      "home.taskFilterRegexHelp": "Only download assets that match the regex.",
      "home.forceUpdate": "Force update",
      "home.keepRaw": "Keep raw cache",
      "home.keepRawDesc": "Preserve cache/assets instead of deleting after decrypt.",
      "home.keepPath": "Keep download path",
      "home.keepPathDesc": "Keep original folder structure under cache/assets.",
      "home.startTask": "Start task",
      "home.taskLog": "Task log",
      "home.clearLog": "Clear",
      "home.quickFilters": "Quick filters",
      "home.filterMedia": "Media",
      "home.filterCharacter": "Character",
      "home.recentTasks": "Recent tasks",
      "home.noTasks": "No tasks yet.",
      "home.noTaskStarted": "No task started.",
      "home.statusReady": "Ready",
      "home.statusMissing": "Missing",
      "home.statusUpdated": "Updated",
      "home.statusIdle": "Idle",
      "home.statusCatalogUpdated": "Catalog updated {{time}}",
      "home.statusCatalogMissing": "Catalog not loaded.",
      "home.statusFailed": "Failed to load status.",
      "home.taskDesc.update":
        "Download manifest and assets, decrypt to cache/plain, parse masterdata.",
      "home.taskDesc.dbonly":
        "Download and parse database assets only (tsv).",
      "home.taskDesc.convert":
        "Skip download; decrypt cache/assets to cache/plain.",
      "home.taskDesc.master":
        "Parse existing cache/plain tsv into masterdata.",
      "home.taskDesc.analyze": "Run structure analysis only.",
      "search.eyebrow": "Catalog",
      "search.title": "Search results",
      "search.searchPlaceholder": "Search...",
      "search.searchButton": "Search",
      "search.clear": "Clear",
      "search.field.all": "All fields",
      "search.field.label": "Label",
      "search.field.type": "Type",
      "search.field.deps": "Dependencies",
      "search.field.content": "Content types",
      "search.field.categories": "Categories",
      "search.field.realname": "Real name",
      "search.typeLabel": "Type",
      "search.sort": "Sort",
      "search.order": "Order",
      "search.perPage": "Per page",
      "search.view": "View",
      "search.view.grid": "Grid",
      "search.view.list": "List",
      "search.all": "All",
      "search.asc": "Ascending",
      "search.desc": "Descending",
      "search.entries": "{{count}} entries",
      "search.loading": "Loading catalog...",
      "search.failed": "Failed to load catalog.",
      "search.open": "Open",
      "search.filterTags": "Tags",
      "filters.media.image": "Image",
      "filters.media.video": "Video",
      "filters.media.audio": "Audio",
      "filters.media.model": "3D/Model",
      "filters.media.motion": "Motion",
      "filters.media.story": "Story/Text",
      "filters.media.chart": "Charts/Data",
      "filters.tag.skill": "Skill",
      "filters.tag.middle": "Middle",
      "filters.tag.full": "Full",
      "filters.tag.half": "Half",
      "filters.tag.season": "Season",
      "filters.tag.adv": "Adv",
      "filters.character.sachi": "Sachi",
      "filters.character.kaho": "Kaho",
      "filters.character.sayaka": "Sayaka",
      "filters.character.tsuzuri": "Tsuzuri",
      "filters.character.megumi": "Megumi",
      "filters.character.ginko": "Ginko",
      "filters.character.rurino": "Rurino",
      "filters.character.kozue": "Kozue",
      "filters.character.kosuzu": "Kosuzu",
      "filters.character.hime": "Hime",
      "filters.character.ceras": "Ceras",
      "filters.character.izumi": "Izumi",
      "filters.character.tsukasa": "Tsukasa",
      "filters.character.hiromi": "Hiromi",
      "view.metadata": "Metadata",
      "view.label": "Label",
      "view.resource": "Resource",
      "view.size": "Size",
      "view.checksum": "Checksum",
      "view.seed": "Seed",
      "view.priority": "Priority",
      "view.raw": "Raw",
      "view.plain": "Plain",
      "view.yaml": "YAML",
      "view.files": "Files",
      "view.preview": "Preview",
      "view.dependencies": "Dependencies",
      "view.contentTypes": "Content types",
      "view.categories": "Categories",
      "view.downloadRaw": "Download raw",
      "view.downloadPlain": "Download plain",
      "view.downloadYaml": "Download YAML",
      "view.exportPreview": "Refresh Preview",
      "view.available": "Available",
      "view.missing": "Missing",
      "view.previewNotAvailable": "Preview not available.",
      "view.previewNotGenerated":
        "Preview not generated yet. Auto export runs on page load; click Refresh to retry.",
      "view.previewNotSupported": "Preview not supported.",
      "view.exportFailed": "Export failed.",
      "view.exportNotConfigured": "Export not configured.",
      "view.derivedPreview": "Derived preview",
      "view.previewConfigAssetbundle":
        "Assetbundle export: set ASSETRIPPER_DIR to the AssetRipper folder.",
      "view.previewConfigService":
        "Inspix-hailstorm will start AssetRipper headless and call its export API.",
      "view.previewConfigAcb":
        "ACB audio preview: require vgmstream-cli + ffmpeg in PATH.",
      "view.previewConfigUsm":
        "USM video preview: require ffmpeg in PATH (auto transcode to MP4).",
      "view.previewConfigCache": "Outputs cached under cache/webui-preview.",
      "view.previewConfigReadme": "Detailed steps in",
      "view.failedLoad": "Failed to load entry.",
      "view.outputDir": "Output:",
      "view.trackLabel": "Track {{index}}",
      "master.title": "Parsed YAML library",
      "master.subtitle": "Browse generated YAML files from masterdata.",
      "master.filter": "Filter",
      "master.files": "Files",
      "master.preview": "Preview",
      "master.download": "Download",
      "master.loading": "Loading files...",
      "master.noFiles": "No files found.",
      "master.selectFile": "Select a file.",
      "master.failedLoad": "Failed to load file.",
      "master.failedList": "Failed to load masterdata.",
      "preview.export": "Refresh Preview",
    },
    zh: {
      "nav.overview": "概览",
      "nav.search": "检索",
      "nav.masterdata": "主数据",
      "nav.searchPlaceholder": "搜索 Label/Type/CRC",
      "footer.tagline": "本地工具，本地数据。",
      "home.heroEyebrow": "资源控制台",
      "home.heroTitle": "下载、解密、解析，一站完成。",
      "home.heroSubtitle":
        "在浏览器里完成更新、转换与主数据生成，所有数据都在本地缓存中运行。",
      "home.browseCatalog": "浏览资源",
      "home.status": "状态",
      "home.statusVersion": "版本",
      "home.statusCatalog": "清单",
      "home.statusDb": "DB 条目",
      "home.statusPlain": "解密缓存",
      "home.statusAssets": "原始缓存",
      "home.statusMaster": "主数据",
      "home.runTask": "运行任务",
      "home.queue": "队列",
      "home.taskMode": "模式",
      "home.taskOption.update": "更新（下载 + 解析）",
      "home.taskOption.dbonly": "仅更新数据库",
      "home.taskOption.convert": "转换（解密已有资源）",
      "home.taskOption.master": "主数据（解析已有）",
      "home.taskOption.analyze": "仅分析",
      "home.taskClientVersion": "客户端版本",
      "home.taskClientVersionPlaceholder": "可留空",
      "home.taskClientVersionHelp": "留空时自动获取。",
      "home.taskResInfo": "资源信息",
      "home.taskResInfoPlaceholder": "可留空",
      "home.taskResInfoHelp": "留空时自动获取。",
      "home.taskFilterRegex": "过滤正则",
      "home.taskFilterRegexPlaceholder": "例如 bgm_.*",
      "home.taskFilterRegexHelp": "仅下载匹配正则的资源。",
      "home.forceUpdate": "强制更新",
      "home.keepRaw": "保留原始缓存",
      "home.keepRawDesc": "解密后不清理 cache/assets 原始文件。",
      "home.keepPath": "保留下载路径",
      "home.keepPathDesc": "保持 cache/assets 的原始目录结构。",
      "home.startTask": "开始任务",
      "home.taskLog": "任务日志",
      "home.clearLog": "清空",
      "home.quickFilters": "快捷筛选",
      "home.filterMedia": "资源类型",
      "home.filterCharacter": "角色",
      "home.recentTasks": "最近任务",
      "home.noTasks": "暂无任务。",
      "home.noTaskStarted": "尚未开始任务。",
      "home.statusReady": "已就绪",
      "home.statusMissing": "缺失",
      "home.statusUpdated": "已更新",
      "home.statusIdle": "空闲",
      "home.statusCatalogUpdated": "清单更新于 {{time}}",
      "home.statusCatalogMissing": "尚未加载清单。",
      "home.statusFailed": "状态加载失败。",
      "home.taskDesc.update": "下载清单与资源，解密至 cache/plain，并解析主数据。",
      "home.taskDesc.dbonly": "仅下载并解析数据库资源（tsv）。",
      "home.taskDesc.convert": "不下载，直接解密 cache/assets 到 cache/plain。",
      "home.taskDesc.master": "解析 cache/plain 中的 tsv 生成主数据。",
      "home.taskDesc.analyze": "仅运行结构分析。",
      "search.eyebrow": "资源库",
      "search.title": "搜索结果",
      "search.searchPlaceholder": "搜索...",
      "search.searchButton": "搜索",
      "search.clear": "清除",
      "search.field.all": "全部字段",
      "search.field.label": "Label",
      "search.field.type": "Type",
      "search.field.deps": "依赖",
      "search.field.content": "内容类型",
      "search.field.categories": "分类",
      "search.field.realname": "真实文件名",
      "search.typeLabel": "类型",
      "search.sort": "排序",
      "search.order": "顺序",
      "search.perPage": "每页数量",
      "search.view": "视图",
      "search.view.grid": "矩阵",
      "search.view.list": "列表",
      "search.all": "全部",
      "search.asc": "升序",
      "search.desc": "降序",
      "search.entries": "{{count}} 条结果",
      "search.loading": "正在加载清单...",
      "search.failed": "加载清单失败。",
      "search.open": "打开",
      "search.filterTags": "标签",
      "filters.media.image": "图片",
      "filters.media.video": "视频",
      "filters.media.audio": "音频",
      "filters.media.model": "3D/模型",
      "filters.media.motion": "动作/动画",
      "filters.media.story": "剧情/文本",
      "filters.media.chart": "谱面/数据",
      "filters.tag.skill": "Skill",
      "filters.tag.middle": "Middle",
      "filters.tag.full": "Full",
      "filters.tag.half": "Half",
      "filters.tag.season": "Season",
      "filters.tag.adv": "Adv",
      "filters.character.sachi": "Sachi",
      "filters.character.kaho": "Kaho",
      "filters.character.sayaka": "Sayaka",
      "filters.character.tsuzuri": "Tsuzuri",
      "filters.character.megumi": "Megumi",
      "filters.character.ginko": "Ginko",
      "filters.character.rurino": "Rurino",
      "filters.character.kozue": "Kozue",
      "filters.character.kosuzu": "Kosuzu",
      "filters.character.hime": "Hime",
      "filters.character.ceras": "Ceras",
      "filters.character.izumi": "Izumi",
      "filters.character.tsukasa": "Tsukasa",
      "filters.character.hiromi": "Hiromi",
      "view.metadata": "元数据",
      "view.label": "Label",
      "view.resource": "资源",
      "view.size": "大小",
      "view.checksum": "校验",
      "view.seed": "Seed",
      "view.priority": "优先级",
      "view.raw": "原始",
      "view.plain": "解密",
      "view.yaml": "YAML",
      "view.files": "文件",
      "view.preview": "预览",
      "view.dependencies": "依赖",
      "view.contentTypes": "内容类型",
      "view.categories": "分类",
      "view.downloadRaw": "下载原始文件",
      "view.downloadPlain": "下载解密文件",
      "view.downloadYaml": "下载 YAML",
      "view.exportPreview": "刷新预览",
      "view.available": "可用",
      "view.missing": "缺失",
      "view.previewNotAvailable": "无法预览。",
      "view.previewNotGenerated":
        "尚未生成预览（页面加载时已自动运行导出，可点击“刷新预览”重试）。",
      "view.previewNotSupported": "不支持预览。",
      "view.exportFailed": "导出失败。",
      "view.exportNotConfigured": "未配置导出。",
      "view.derivedPreview": "派生预览",
      "view.previewConfigAssetbundle":
        "Assetbundle 导出：设置 ASSETRIPPER_DIR 为 AssetRipper 目录。",
      "view.previewConfigService":
        "Inspix-hailstorm 会以 headless 模式启动 AssetRipper 并自动调用导出接口。",
      "view.previewConfigAcb":
        "ACB 预览：需要 vgmstream-cli 与 ffmpeg 可执行文件在 PATH 中。",
      "view.previewConfigUsm":
        "USM 预览：需要 ffmpeg 在 PATH 中（会自动转码为 MP4）。",
      "view.previewConfigCache": "输出缓存于 cache/webui-preview。",
      "view.previewConfigReadme": "详细步骤参考",
      "view.failedLoad": "加载条目失败。",
      "view.outputDir": "输出目录：",
      "view.trackLabel": "轨道 {{index}}",
      "master.title": "主数据 YAML",
      "master.subtitle": "浏览已生成的主数据 YAML 文件。",
      "master.filter": "过滤",
      "master.files": "文件",
      "master.preview": "预览",
      "master.download": "下载",
      "master.loading": "正在加载文件...",
      "master.noFiles": "未找到文件。",
      "master.selectFile": "请选择文件。",
      "master.failedLoad": "加载文件失败。",
      "master.failedList": "加载主数据失败。",
      "preview.export": "刷新预览",
    },
    ja: {
      "nav.overview": "概要",
      "nav.search": "検索",
      "nav.masterdata": "マスターデータ",
      "nav.searchPlaceholder": "Label/Type/CRC を検索",
      "footer.tagline": "ローカルツール、ローカルデータ。",
      "home.heroEyebrow": "マニフェスト制御",
      "home.heroTitle": "取得・復号・解析を一箇所で。",
      "home.heroSubtitle":
        "ブラウザから更新・変換・マスターデータ生成を実行。すべてローカルキャッシュで動作します。",
      "home.browseCatalog": "カタログを見る",
      "home.status": "状態",
      "home.statusVersion": "バージョン",
      "home.statusCatalog": "カタログ",
      "home.statusDb": "DB 件数",
      "home.statusPlain": "復号キャッシュ",
      "home.statusAssets": "生キャッシュ",
      "home.statusMaster": "マスターデータ",
      "home.runTask": "タスク実行",
      "home.queue": "キュー",
      "home.taskMode": "モード",
      "home.taskOption.update": "更新（ダウンロード + 解析）",
      "home.taskOption.dbonly": "DB のみ更新",
      "home.taskOption.convert": "変換（既存の復号）",
      "home.taskOption.master": "マスターデータ（既存解析）",
      "home.taskOption.analyze": "解析のみ",
      "home.taskClientVersion": "クライアント版本",
      "home.taskClientVersionPlaceholder": "任意",
      "home.taskClientVersionHelp": "空欄なら自動取得します。",
      "home.taskResInfo": "リソース情報",
      "home.taskResInfoPlaceholder": "任意",
      "home.taskResInfoHelp": "空欄なら自動取得します。",
      "home.taskFilterRegex": "フィルタ正規表現",
      "home.taskFilterRegexPlaceholder": "例: bgm_.*",
      "home.taskFilterRegexHelp": "一致した資産のみをダウンロードします。",
      "home.forceUpdate": "強制更新",
      "home.keepRaw": "生キャッシュを保持",
      "home.keepRawDesc": "復号後も cache/assets を削除しません。",
      "home.keepPath": "ダウンロード経路を保持",
      "home.keepPathDesc": "cache/assets の元ディレクトリ構造を保持します。",
      "home.startTask": "タスク開始",
      "home.taskLog": "タスクログ",
      "home.clearLog": "クリア",
      "home.quickFilters": "クイックフィルター",
      "home.filterMedia": "種類",
      "home.filterCharacter": "キャラクター",
      "home.recentTasks": "最近のタスク",
      "home.noTasks": "タスクはありません。",
      "home.noTaskStarted": "まだタスクが開始されていません。",
      "home.statusReady": "準備完了",
      "home.statusMissing": "不足",
      "home.statusUpdated": "更新済み",
      "home.statusIdle": "待機中",
      "home.statusCatalogUpdated": "カタログ更新: {{time}}",
      "home.statusCatalogMissing": "カタログが読み込まれていません。",
      "home.statusFailed": "状態の取得に失敗しました。",
      "home.taskDesc.update":
        "マニフェストと資産を取得し、cache/plain に復号してマスターデータを解析します。",
      "home.taskDesc.dbonly": "DB 資産（tsv）のみ取得して解析します。",
      "home.taskDesc.convert":
        "ダウンロードせず、cache/assets を cache/plain に復号します。",
      "home.taskDesc.master": "cache/plain の tsv を解析してマスターデータを生成します。",
      "home.taskDesc.analyze": "構造解析のみ実行します。",
      "search.eyebrow": "カタログ",
      "search.title": "検索結果",
      "search.searchPlaceholder": "検索...",
      "search.searchButton": "検索",
      "search.clear": "クリア",
      "search.field.all": "全フィールド",
      "search.field.label": "Label",
      "search.field.type": "Type",
      "search.field.deps": "依存関係",
      "search.field.content": "コンテンツタイプ",
      "search.field.categories": "カテゴリ",
      "search.field.realname": "実ファイル名",
      "search.typeLabel": "タイプ",
      "search.sort": "並び替え",
      "search.order": "順序",
      "search.perPage": "件数/ページ",
      "search.view": "表示",
      "search.view.grid": "グリッド",
      "search.view.list": "リスト",
      "search.all": "すべて",
      "search.asc": "昇順",
      "search.desc": "降順",
      "search.entries": "{{count}} 件",
      "search.loading": "カタログを読み込み中...",
      "search.failed": "カタログの読み込みに失敗しました。",
      "search.open": "開く",
      "search.filterTags": "タグ",
      "filters.media.image": "画像",
      "filters.media.video": "動画",
      "filters.media.audio": "音声",
      "filters.media.model": "3D/モデル",
      "filters.media.motion": "モーション",
      "filters.media.story": "ストーリー/テキスト",
      "filters.media.chart": "譜面/データ",
      "filters.tag.skill": "Skill",
      "filters.tag.middle": "Middle",
      "filters.tag.full": "Full",
      "filters.tag.half": "Half",
      "filters.tag.season": "Season",
      "filters.tag.adv": "Adv",
      "filters.character.sachi": "Sachi",
      "filters.character.kaho": "Kaho",
      "filters.character.sayaka": "Sayaka",
      "filters.character.tsuzuri": "Tsuzuri",
      "filters.character.megumi": "Megumi",
      "filters.character.ginko": "Ginko",
      "filters.character.rurino": "Rurino",
      "filters.character.kozue": "Kozue",
      "filters.character.kosuzu": "Kosuzu",
      "filters.character.hime": "Hime",
      "filters.character.ceras": "Ceras",
      "filters.character.izumi": "Izumi",
      "filters.character.tsukasa": "Tsukasa",
      "filters.character.hiromi": "Hiromi",
      "view.metadata": "メタデータ",
      "view.label": "Label",
      "view.resource": "リソース",
      "view.size": "サイズ",
      "view.checksum": "チェックサム",
      "view.seed": "Seed",
      "view.priority": "優先度",
      "view.raw": "Raw",
      "view.plain": "Plain",
      "view.yaml": "YAML",
      "view.files": "ファイル",
      "view.preview": "プレビュー",
      "view.dependencies": "依存関係",
      "view.contentTypes": "コンテンツタイプ",
      "view.categories": "カテゴリ",
      "view.downloadRaw": "生データをダウンロード",
      "view.downloadPlain": "復号データをダウンロード",
      "view.downloadYaml": "YAML をダウンロード",
      "view.exportPreview": "プレビューを更新",
      "view.available": "あり",
      "view.missing": "なし",
      "view.previewNotAvailable": "プレビューできません。",
      "view.previewNotGenerated":
        "プレビュー未生成です。ページ読み込み時に自動エクスポート済みのため、更新で再実行できます。",
      "view.previewNotSupported": "プレビュー未対応です。",
      "view.exportFailed": "エクスポートに失敗しました。",
      "view.exportNotConfigured": "エクスポート未設定。",
      "view.derivedPreview": "派生プレビュー",
      "view.previewConfigAssetbundle":
        "Assetbundle エクスポート：ASSETRIPPER_DIR を AssetRipper フォルダに設定します。",
      "view.previewConfigService":
        "Inspix-hailstorm が AssetRipper を headless で起動し、エクスポート API を呼び出します。",
      "view.previewConfigAcb":
        "ACB プレビュー：vgmstream-cli と ffmpeg を PATH に配置してください。",
      "view.previewConfigUsm":
        "USM プレビュー：ffmpeg を PATH に配置してください（MP4 へ自動変換）。",
      "view.previewConfigCache": "出力は cache/webui-preview に保存されます。",
      "view.previewConfigReadme": "詳細は",
      "view.failedLoad": "エントリの読み込みに失敗しました。",
      "view.outputDir": "出力先:",
      "view.trackLabel": "トラック {{index}}",
      "master.title": "マスターデータ YAML",
      "master.subtitle": "生成済みの YAML ファイルを閲覧します。",
      "master.filter": "フィルター",
      "master.files": "ファイル",
      "master.preview": "プレビュー",
      "master.download": "ダウンロード",
      "master.loading": "ファイルを読み込み中...",
      "master.noFiles": "ファイルがありません。",
      "master.selectFile": "ファイルを選択してください。",
      "master.failedLoad": "ファイルの読み込みに失敗しました。",
      "master.failedList": "マスターデータの読み込みに失敗しました。",
      "preview.export": "プレビューを更新",
    },
  };

  let lang = "en";

  function normalizeLang(value) {
    if (!value) {
      return "en";
    }
    const lowered = value.toLowerCase();
    if (lowered.startsWith("zh")) {
      return "zh";
    }
    if (lowered.startsWith("ja")) {
      return "ja";
    }
    return "en";
  }

  function detectLang() {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("lang");
    if (fromUrl) {
      return normalizeLang(fromUrl);
    }
    const stored = localStorage.getItem("hailstorm-lang");
    if (stored) {
      return normalizeLang(stored);
    }
    return normalizeLang(navigator.language || "en");
  }

  function setLang(value) {
    lang = normalizeLang(value);
    localStorage.setItem("hailstorm-lang", lang);
    document.documentElement.setAttribute("lang", lang);
  }

  function t(key, vars) {
    const dictionary = strings[lang] || strings.en;
    let text = dictionary[key] || strings.en[key] || key;
    if (vars) {
      Object.entries(vars).forEach(([name, value]) => {
        text = text.replaceAll(`{{${name}}}`, value);
      });
    }
    return text;
  }

  function apply(root = document) {
    root.querySelectorAll("[data-i18n]").forEach((node) => {
      node.textContent = t(node.dataset.i18n);
    });
    root.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
      node.setAttribute("placeholder", t(node.dataset.i18nPlaceholder));
    });
    root.querySelectorAll("[data-i18n-title]").forEach((node) => {
      node.setAttribute("title", t(node.dataset.i18nTitle));
    });
  }

  function withLang(url) {
    const parsed = new URL(url, window.location.origin);
    parsed.searchParams.set("lang", lang);
    return parsed.pathname + parsed.search;
  }

  function ensureLangInputs() {
    document.querySelectorAll("input.lang-input").forEach((input) => {
      input.value = lang;
    });
  }

  function applyLangLinks() {
    document.querySelectorAll("a[data-lang-link]").forEach((link) => {
      const href = link.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("mailto:")) {
        return;
      }
      link.setAttribute("href", withLang(href));
    });
  }

  function bindLangSwitch() {
    const select = document.getElementById("langSelect");
    if (!select) {
      return;
    }
    select.value = lang;
    select.addEventListener("change", () => {
      const params = new URLSearchParams(window.location.search);
      params.set("lang", select.value);
      window.location.search = params.toString();
    });
  }

  function init() {
    setLang(detectLang());
    apply();
    ensureLangInputs();
    applyLangLinks();
    bindLangSwitch();
  }

  return {
    get lang() {
      return lang;
    },
    t,
    apply,
    withLang,
    init,
  };
})();

document.addEventListener("DOMContentLoaded", () => {
  if (window.I18n) {
    window.I18n.init();
  }
});
