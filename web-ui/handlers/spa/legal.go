package spa

import (
	"html/template"

	"github.com/webtor-io/web-ui/services/web"
)

func init() {
	for _, name := range []string{"tos", "privacy", "dmca", "refund"} {
		view := "legal/" + name
		page(view, func(cfg *config, ctx *web.Context) (any, error) { return cfg.legal(view, ctx) })
	}
}

// Legal is one legal page. The text is not translated (CLAUDE.md) and lives
// in one place, its template: the view defines "legal_body" and, when the
// page is dated, "legal_updated", which the classic page renders inside its
// own frame and this builder renders for the app.
type Legal struct {
	Title   string        `json:"title"`
	Updated string        `json:"updated,omitempty"`
	HTML    template.HTML `json:"html"`
}

func (cfg *config) legal(view string, ctx *web.Context) (any, error) {
	title, err := cfg.spa.Block(view, "title", ctx)
	if err != nil {
		return nil, err
	}
	body, err := cfg.spa.Block(view, "legal_body", ctx)
	if err != nil {
		return nil, err
	}
	out := &Legal{Title: string(title), HTML: body}
	// the DMCA notice carries no date
	if updated, err := cfg.spa.Block(view, "legal_updated", ctx); err == nil {
		out.Updated = string(updated)
	}
	return out, nil
}
