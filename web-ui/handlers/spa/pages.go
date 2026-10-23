// Package spa maps the data each Go handler already builds onto the JSON the
// React pages read (frontend/src/pages). One builder per view; a view with no
// builder keeps rendering from its template. The builders only reshape:
// every query, check and redirect stays in the handler that owns it.
package spa

import (
	"errors"

	"github.com/urfave/cli"

	"github.com/webtor-io/web-ui/handlers/resource"
	"github.com/webtor-io/web-ui/services/common"
	"github.com/webtor-io/web-ui/services/offer"
	rec "github.com/webtor-io/web-ui/services/recommendations"
	"github.com/webtor-io/web-ui/services/spa"
	"github.com/webtor-io/web-ui/services/turnstile"
	"github.com/webtor-io/web-ui/services/web"
)

var errNoData = errors.New("page data of an unexpected type")

type config struct {
	demoMagnet string
	resource   *resource.Helper
	ai         *rec.Helper
	offers     *offer.Service
	// spa renders a view's own template blocks (the legal text).
	spa *spa.Service
	// turnstile is the support form's check (not the job starts').
	turnstile *turnstile.Helper
}

// builder makes a view's JSON from its handler data. Each page file
// registers its own in init() (page, fragment), so adding a page never
// touches this file.
type builder func(cfg *config, ctx *web.Context) (any, error)

var (
	pageBuilders     = map[string]builder{}
	fragmentBuilders = map[string]builder{}
)

// page registers the React page for a full-page view.
func page(view string, b builder) { pageBuilders[view] = b }

// fragment registers the JSON answer for a layout-less view (spa.Service.RegisterFragment).
func fragment(view string, b builder) { fragmentBuilders[view] = b }

// RegisterPages tells the React app which views it answers.
func RegisterPages(s *spa.Service, c *cli.Context, offers *offer.Service) {
	cfg := &config{
		demoMagnet: c.String(common.DemoMagnetFlag),
		resource:   resource.NewHelper(c.String(common.SessionSecretFlag)),
		ai:         rec.NewHelper(c),
		offers:     offers,
		spa:        s,
		turnstile:  turnstile.NewHelper(c),
	}
	bind := func(b builder) spa.Page {
		return func(ctx *web.Context) (any, error) { return b(cfg, ctx) }
	}
	for view, b := range pageBuilders {
		s.Register(view, bind(b))
	}
	for view, b := range fragmentBuilders {
		s.RegisterFragment(view, bind(b))
	}
}
