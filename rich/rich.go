package rich

import (
	"fmt"

	"github.com/fatih/color"
)

func Info(text string, a ...any) {
	msg := fmt.Sprintf(text, a...)
	emit("info", msg)
	fmt.Println(color.BlueString(">>> [Info]"), msg)
}

func Error(text string, a ...any) {
	msg := fmt.Sprintf(text, a...)
	emit("error", msg)
	fmt.Println(color.RedString(">>> [Error]"), msg)
}

func Warning(text string, a ...any) {
	msg := fmt.Sprintf(text, a...)
	emit("warning", msg)
	fmt.Println(color.YellowString(">>> [Warning]"), msg)
}

func Panic(text string, a ...any) {
	Error(text, a...)
	panic("Exiting program due to the aforementioned reasons.")
}

func PanicError(text string, err error, a ...any) {
	Error(text, a...)
	panic(err)
}
