package main

import (
	"flag"
	"os"

	"vertesan/hailstorm/rich"
	"vertesan/hailstorm/runner"
	"vertesan/hailstorm/webui"
)

func main() {
	fWeb := flag.Bool("web", false, "Start the WebUI server.")
	fAddr := flag.String("addr", "127.0.0.1:5001", "WebUI listen address.")
	opts := runner.ParseFlags()

	if *fWeb {
		if err := webui.Run(*fAddr); err != nil {
			rich.Error("WebUI failed: %v", err)
			os.Exit(1)
		}
		return
	}

	if err := runner.Run(opts); err != nil {
		rich.Error("%v", err)
		os.Exit(1)
	}
}
