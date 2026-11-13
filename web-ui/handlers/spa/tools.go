package spa

import (
	"github.com/webtor-io/web-ui/handlers/common"
	"github.com/webtor-io/web-ui/services/web"
)

func init() { page("tools/index", (*config).tools) }

// Tools is /tools: every tool page, in the footer's groups.
type Tools struct {
	Tools []ToolCard `json:"tools"`
}

type ToolCard struct {
	URL     string `json:"url"`
	Title   string `json:"title"`
	Benefit string `json:"benefit"`
	// Group is one of common.ToolGroups, or "guides" for a guide.
	Group string `json:"group"`
}

func (cfg *config) tools(_ *web.Context) (any, error) {
	out := &Tools{}
	for _, t := range common.Tools {
		group := t.Group
		if t.Guide {
			group = "guides"
		}
		out.Tools = append(out.Tools, ToolCard{URL: t.Url, Title: t.Title, Benefit: t.Benefit, Group: group})
	}
	return out, nil
}
