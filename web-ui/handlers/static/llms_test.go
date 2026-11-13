package static_test

import (
	"flag"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/urfave/cli"
	"github.com/webtor-io/web-ui/handlers/static"
	"github.com/webtor-io/web-ui/services/common"
)

// llms.txt links to the deployment it is served from, never to a fixed host.
func TestLLMsTxtUsesTheDomain(t *testing.T) {
	t.Chdir("../..")
	gin.SetMode(gin.TestMode)
	set := flag.NewFlagSet("test", flag.ContinueOnError)
	set.String(static.AssetsPathFlag, t.TempDir(), "")
	set.String(static.AssetsHostFlag, "", "")
	set.String(static.IndexNowKeyFlag, "", "")
	set.String(common.DomainFlag, "https://torrently.example/", "")
	r := gin.New()
	if err := static.RegisterHandler(cli.NewContext(nil, set, nil), r); err != nil {
		t.Fatal(err)
	}
	res := get(r, "/llms.txt")
	body := res.Body.String()
	if res.Code != 200 || !strings.Contains(body, "(https://torrently.example/discover)") {
		t.Fatalf("llms.txt: %d %.200q", res.Code, body)
	}
	if strings.Contains(body, "{{DOMAIN}}") || strings.Contains(body, "https://webtor.io") {
		t.Error("llms.txt keeps a placeholder or Webtor's address")
	}
}
