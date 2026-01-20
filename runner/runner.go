package runner

import (
	"flag"
	"fmt"
	"os"
	"reflect"
	"regexp"

	"vertesan/hailstorm/analyser"
	"vertesan/hailstorm/manifest"
	"vertesan/hailstorm/master"
	"vertesan/hailstorm/network"
	"vertesan/hailstorm/rich"
	"vertesan/hailstorm/utils"
)

const (
	ManifestSaveDir        = "cache"
	AssetsSaveDir          = "cache/assets"
	DecryptedAssetsSaveDir = "cache/plain"
	DbSaveDir              = "masterdata"

	CatalogVersionFile  = "cache/currentVersion.txt"
	CatalogJsonFile     = "cache/catalog.json"
	CatalogJsonFilePrev = "cache/catalog_prev.json"
	CatalogJsonDiffFile = "cache/catalog_diff.json"
	UpdatedFlagFile     = "cache/updated"
)

type Options struct {
	Analyze       bool
	DbOnly        bool
	Force         bool
	KeepRaw       bool
	Convert       bool
	Master        bool
	KeepPath      bool
	ClientVersion string
	ResInfo       string
	FilterRegex   string
}

func Run(opts Options) (err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("%v", r)
		}
	}()
	runUnsafe(opts)
	return nil
}

func ParseFlags() Options {
	fAnalyze := flag.Bool("analyze", false, "Do code analysis and exit.")
	fDbOnly := flag.Bool("dbonly", false, "Only download and decrypt DB files, put assets aside.")
	fForce := flag.Bool("force", false, "Ignore current cached version and update caches.")
	fKeepRaw := flag.Bool("keepraw", false, "Do not delete encrypted raw asset files after decrypting.")
	fConvert := flag.Bool("convert", false, "Only generate cache/plain from existing cache/assets without downloading.")
	fMaster := flag.Bool("master", false, "Only generate masterdata from existing cache/plain without downloading.")
	fKeepPath := flag.Bool("keep-path", false, "Imitate url download path on file system for assets.")
	fClientVersion := flag.String("client-version", "", "Specify client version manually.")
	fResInfo := flag.String("res-info", "", "Specify resource info manually.")
	fFilterRegex := flag.String("filter-regex", "", "Only download assets that match the regex pattern. eg. --filter-regex=\"bgm_.*\"")
	flag.Parse()

	return Options{
		Analyze:       *fAnalyze,
		DbOnly:        *fDbOnly,
		Force:         *fForce,
		KeepRaw:       *fKeepRaw,
		Convert:       *fConvert,
		Master:        *fMaster,
		KeepPath:      *fKeepPath,
		ClientVersion: *fClientVersion,
		ResInfo:       *fResInfo,
		FilterRegex:   *fFilterRegex,
	}
}

func runUnsafe(opts Options) {
	if opts.Analyze {
		doAnalyze()
		return
	}

	if opts.Convert {
		runConvert()
		return
	}

	if opts.Master {
		runMaster()
		return
	}

	if err := os.Remove(UpdatedFlagFile); err != nil {
		if !os.IsNotExist(err) {
			panic(err)
		}
	}
	clientVersion := opts.ClientVersion
	resInfo := opts.ResInfo
	if clientVersion == "" {
		var err error
		if clientVersion, err = network.GetPlayVersion(); err != nil {
			panic(err)
		}
	}
	if resInfo == "" {
		resInfo = network.Login(clientVersion)
	}

	currentVer, err := os.ReadFile(CatalogVersionFile)
	if err != nil {
		if !os.IsNotExist(err) {
			panic(err)
		}
	}

	if !opts.Force && resInfo == string(currentVer) {
		rich.Info("Nothing updated, will be stopping process.")
		return
	}

	rich.Info("New resource version: %q.", resInfo)

	mani := new(manifest.Manifest)
	mani.Init(resInfo, clientVersion)

	network.DownloadManifestSync(mani.RealName, ManifestSaveDir)
	catalogFile, err := os.Open(fmt.Sprintf("%v/%v", ManifestSaveDir, mani.RealName))
	if err != nil {
		panic(err)
	}

	catalog := new(manifest.Catalog)
	catalog.Init(mani, catalogFile)

	if err = catalogFile.Close(); err != nil {
		panic(err)
	}
	if err = os.Remove(fmt.Sprintf("%v/%v", ManifestSaveDir, mani.RealName)); err != nil {
		panic(err)
	}

	if err := os.Rename(CatalogJsonFile, CatalogJsonFilePrev); err != nil {
		if !os.IsNotExist(err) {
			panic(err)
		}
	}
	rich.Info("Outdated catalog was renamed to '%s'.", CatalogJsonFilePrev)

	utils.WriteToJsonFile(catalog.Entries, CatalogJsonFile)

	oldEntries := []manifest.Entry{}
	if err := utils.ReadFromJsonFile(CatalogJsonFilePrev, &oldEntries); err != nil {
		if !os.IsNotExist(err) {
			panic(err)
		}
	}

	oldCatalog := &manifest.Catalog{
		Entries: oldEntries,
	}

	if !opts.Force {
		diff(catalog, oldCatalog)
	}

	if opts.DbOnly {
		filterDb(catalog)
	}

	if opts.FilterRegex != "" {
		filterByRegex(catalog, opts.FilterRegex)
	}

	if len(catalog.Entries) == 0 {
		rich.Info("Nothing is updated, will be stopping process.")
		return
	}

	keepPath := opts.KeepPath
	network.DownloadAssetsAsync(catalog, AssetsSaveDir, &keepPath)

	manifest.DecryptAllAssets(catalog, DecryptedAssetsSaveDir, AssetsSaveDir)

	if err := os.MkdirAll(DbSaveDir, 0755); err != nil {
		panic(err)
	}
	errCount := 0
	for _, entry := range catalog.Entries {
		if entry.StrTypeCrc != "tsv" {
			continue
		}
		dbFile, err := os.Open(DecryptedAssetsSaveDir + "/" + entry.StrLabelCrc)
		if err != nil {
			panic(err)
		}
		ins, ok := master.MasterMap[entry.StrLabelCrc]
		if !ok {
			rich.Error("Database %q does not exist. Perhaps `master.MasterMap` needs update.", entry.StrLabelCrc)
			errCount++
			continue
		}
		rows, err := master.Parse(dbFile, entry.StrLabelCrc, &ins)
		if err != nil {
			rich.Error("An error occurred when parsing database.")
			rich.Error(err.Error())
			continue
		}
		utils.WriteToYamlFile(rows, DbSaveDir+"/"+reflect.TypeOf(ins).Name()+".yaml")
	}
	cvf, err := os.Create(CatalogVersionFile)
	if err != nil {
		panic(err)
	}
	if _, err := cvf.WriteString(resInfo); err != nil {
		panic(err)
	}
	if errCount > 0 {
		rich.Error("%d Error(s) occurred during parsing, please check the log.", errCount)
	}
	rich.Info("All databases parsed.")

	if _, err = os.Create(UpdatedFlagFile); err != nil {
		panic(err)
	}

	if !opts.KeepRaw {
		if err := os.RemoveAll(AssetsSaveDir); err != nil {
			panic(err)
		}
	}
}

func doAnalyze() {
	rich.Info("Start analyzing code...")
	analyser.Analyze()
	rich.Info("Analysis completed.")
}

func diff(catalog *manifest.Catalog, outDatedCatalog *manifest.Catalog) {
	rich.Info("Start doing diff.")
	oldMap := make(map[uint64]manifest.Entry)
	for _, entry := range outDatedCatalog.Entries {
		oldMap[entry.LabelCrc] = entry
	}
	entries := []manifest.Entry{}

	for _, entry := range catalog.Entries {
		if oldEntry, ok := oldMap[entry.LabelCrc]; ok {
			if entry.Checksum == oldEntry.Checksum {
				continue
			}
		}
		rich.Info("Found a new or updated entry [%s].", entry.StrLabelCrc)
		entries = append(entries, entry)
	}
	utils.WriteToJsonFile(entries, CatalogJsonDiffFile)
	catalog.Entries = entries
}

func filterDb(catalog *manifest.Catalog) {
	s := []manifest.Entry{}
	for _, entry := range catalog.Entries {
		if entry.StrTypeCrc == "tsv" {
			s = append(s, entry)
		}
	}
	catalog.Entries = s
}

func filterByRegex(catalog *manifest.Catalog, pattern string) {
	re, err := regexp.Compile(pattern)
	if err != nil {
		rich.Error("Invalid regex pattern: %v", err)
		return
	}

	s := []manifest.Entry{}
	for _, entry := range catalog.Entries {
		if re.MatchString(entry.StrLabelCrc) {
			s = append(s, entry)
		}
	}
	catalog.Entries = s
}

func runConvert() {
	rich.Info("Convert mode: generating cache/plain from existing cache/assets...")

	if _, err := os.Stat(CatalogJsonFile); os.IsNotExist(err) {
		rich.Panic("No existing catalog found. Run without -convert first to download assets.")
	}

	entries := []manifest.Entry{}
	if err := utils.ReadFromJsonFile(CatalogJsonFile, &entries); err != nil {
		panic(err)
	}

	catalog := &manifest.Catalog{
		Entries: entries,
	}

	manifest.DecryptAllAssets(catalog, DecryptedAssetsSaveDir, AssetsSaveDir)

	rich.Info("Conversion completed.")
}

func runMaster() {
	rich.Info("Master mode: generating masterdata from existing cache/plain...")

	if _, err := os.Stat(CatalogJsonFile); os.IsNotExist(err) {
		rich.Panic("No existing catalog found. Run without -master first to download assets.")
	}

	entries := []manifest.Entry{}
	if err := utils.ReadFromJsonFile(CatalogJsonFile, &entries); err != nil {
		panic(err)
	}

	catalog := &manifest.Catalog{
		Entries: entries,
	}

	filterDb(catalog)

	if err := os.MkdirAll(DbSaveDir, 0755); err != nil {
		panic(err)
	}

	errCount := 0
	for _, entry := range catalog.Entries {
		if entry.StrTypeCrc != "tsv" {
			continue
		}
		dbFile, err := os.Open(DecryptedAssetsSaveDir + "/" + entry.StrLabelCrc)
		if err != nil {
			rich.Warning("Database file %q not found in cache/plain, skipping.", entry.StrLabelCrc)
			continue
		}
		ins, ok := master.MasterMap[entry.StrLabelCrc]
		if !ok {
			rich.Error("Database %q does not exist. Perhaps `master.MasterMap` needs update.", entry.StrLabelCrc)
			errCount++
			continue
		}
		rows, err := master.Parse(dbFile, entry.StrLabelCrc, &ins)
		if err != nil {
			rich.Error("An error occurred when parsing database.")
			rich.Error(err.Error())
			continue
		}
		utils.WriteToYamlFile(rows, DbSaveDir+"/"+reflect.TypeOf(ins).Name()+".yaml")
	}

	if errCount > 0 {
		rich.Error("%d Error(s) occurred during parsing, please check the log.", errCount)
	}
	rich.Info("Masterdata generation completed.")
}
