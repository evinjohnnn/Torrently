package spa

import (
	"strconv"
	"time"

	"github.com/webtor-io/web-ui/handlers/common"
	"github.com/webtor-io/web-ui/handlers/index"
	"github.com/webtor-io/web-ui/handlers/resource"
	"github.com/webtor-io/web-ui/models"
	"github.com/webtor-io/web-ui/services/web"
)

func init() { page("index", (*config).home) }

// Home is the home page and the 22 tool landings ("index"), and the same
// page while a torrent loads after POST / (handlers/resource.post).
type Home struct {
	Instruction      string         `json:"instruction"`
	Tool             *Tool          `json:"tool"`
	Query            string         `json:"query,omitempty"`
	JobLogURL        string         `json:"jobLogUrl,omitempty"`
	DemoMagnet       string         `json:"demoMagnet,omitempty"`
	ContinueWatching []ContinueItem `json:"continueWatching"`
	Onboarding       *Onboarding    `json:"onboarding,omitempty"`
	AI               *AI            `json:"ai,omitempty"`
	FAQ              []FAQItem      `json:"faq"`
	// Related are the other tool pages, linked under a tool page.
	Related []RelatedTool `json:"related,omitempty"`
}

type RelatedTool struct {
	URL         string `json:"url"`
	Benefit     string `json:"benefit"`
	Description string `json:"description"`
}

// AI is set when the instance runs AI recommendations: the home page then
// advertises them and answers the questions about them.
type AI struct {
	Provider  string `json:"provider"`
	FreeQuota int    `json:"freeQuota"`
	PaidQuota int    `json:"paidQuota"`
}

type Tool struct {
	URL         string    `json:"url"`
	Title       string    `json:"title"`
	Benefit     string    `json:"benefit"`
	Description string    `json:"description"`
	Guide       bool      `json:"guide"`
	Sections    []Section `json:"sections"`
	// AboutKey is the i18n prefix the sections and the page's own FAQ read.
	AboutKey string `json:"aboutKey"`
	FAQ      int    `json:"faq"`
}

// Section is one block of a tool page with its i18n keys resolved, so the
// app never re-derives the conventions in handlers/common/about.go.
type Section struct {
	Kind     string    `json:"kind"`
	Badge    string    `json:"badge"`
	Title    string    `json:"title"`
	Subtitle string    `json:"subtitle,omitempty"`
	Steps    []Step    `json:"steps,omitempty"`
	Paras    []string  `json:"paras,omitempty"`
	Items    []string  `json:"items,omitempty"`
	Cols     []Column  `json:"cols,omitempty"`
	Footer   string    `json:"footer,omitempty"`
	Note     string    `json:"note,omitempty"`
	Extra    *Step     `json:"extra,omitempty"`
	Cap      string    `json:"cap,omitempty"`
	Rate     int       `json:"rate,omitempty"`
	Link     *ToolLink `json:"link,omitempty"`
	CTA      string    `json:"cta,omitempty"`
}

type Step struct {
	Title string `json:"title"`
	Text  string `json:"text"`
}

type Column struct {
	Label string   `json:"label"`
	Items []string `json:"items"`
}

type ToolLink struct {
	URL   string `json:"url"`
	Title string `json:"title"`
}

type ContinueItem struct {
	ResourceID string    `json:"resourceId"`
	Path       string    `json:"path"`
	Title      string    `json:"title"`
	Poster     string    `json:"poster"`
	Adult      bool      `json:"adult"`
	Progress   int       `json:"progress"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

type Onboarding struct {
	Done  int              `json:"done"`
	Total int              `json:"total"`
	Steps []OnboardingStep `json:"steps"`
}

type OnboardingStep struct {
	Key      string `json:"key"`
	Done     bool   `json:"done"`
	Locked   bool   `json:"locked"`
	Title    string `json:"title"`
	Desc     string `json:"desc"`
	CTA      string `json:"cta"`
	CTACount int    `json:"ctaCount,omitempty"`
	Path     string `json:"path,omitempty"`
	Fragment string `json:"fragment,omitempty"`
}

func (cfg *config) home(ctx *web.Context) (any, error) {
	out := &Home{
		DemoMagnet:       cfg.demoMagnet,
		ContinueWatching: []ContinueItem{},
	}
	if cfg.ai.AiEnabled() {
		out.AI = &AI{Provider: cfg.ai.AiProvider(), FreeQuota: cfg.ai.AiFreeQuota(), PaidQuota: cfg.ai.AiPaidQuota()}
	}
	var (
		tool  *common.Tool
		watch []*models.WatchHistory
	)
	switch d := ctx.Data.(type) {
	case *index.Data:
		out.Instruction = d.Instruction
		tool = d.Tool
		watch = d.ContinueWatching
		out.Onboarding = onboarding(d.Onboarding)
	case *resource.PostData:
		out.Instruction = d.Instruction
		tool = d.Tool
		watch = d.ContinueWatching
		if d.Args != nil {
			out.Query = d.Args.Query
		}
		if d.Job != nil {
			out.JobLogURL = web.LangURL(ctx.Lang, "/queue/"+d.Job.Queue+"/job/"+d.Job.ID+"/log")
		}
	}
	if tool != nil {
		out.Tool = cfg.toolOf(tool)
		for _, t := range common.Tools {
			if t.Url != tool.Url {
				out.Related = append(out.Related, RelatedTool{URL: t.Url, Benefit: t.Benefit, Description: t.Description})
			}
		}
	}
	out.FAQ = cfg.faq(tool)
	for _, w := range watch {
		out.ContinueWatching = append(out.ContinueWatching, ContinueItem{
			ResourceID: w.ResourceID,
			Path:       w.Path,
			Title:      w.DisplayName(),
			Poster:     web.PosterURL(w.ResourceID, 240, w.IsAdult(), ctx),
			Adult:      web.ShowAdultBadge(w.IsAdult(), ctx),
			Progress:   w.Progress(),
			UpdatedAt:  w.UpdatedAt,
		})
	}
	return out, nil
}

func (cfg *config) toolOf(t *common.Tool) *Tool {
	out := &Tool{
		URL:         t.Url,
		Title:       t.Title,
		Benefit:     t.Benefit,
		Description: t.Description,
		Guide:       t.Guide,
		AboutKey:    t.AboutKey(),
		FAQ:         t.FAQ,
		Sections:    []Section{},
	}
	for _, s := range t.Sections {
		sec := Section{
			Kind:  string(s.Kind),
			Badge: "tool.about.badges." + s.Badge,
			Title: s.FieldKey("title"),
			CTA:   s.CTA,
		}
		switch s.Kind {
		case common.AboutSteps:
			sec.Subtitle = s.FieldKey("subtitle")
			for i := 1; i <= 3; i++ {
				n := strconv.Itoa(i)
				sec.Steps = append(sec.Steps, Step{Title: s.FieldKey("step" + n + ".title"), Text: s.FieldKey("step" + n + ".text")})
			}
		case common.AboutProse:
			for _, p := range s.ParaList() {
				sec.Paras = append(sec.Paras, p.Key)
			}
			if s.Link != nil {
				sec.Link = &ToolLink{URL: s.Link.Url, Title: s.Link.TitleKey}
			}
		case common.AboutChecklist:
			sec.Subtitle = s.FieldKey("subtitle")
			sec.Items = s.ItemKeys()
			if s.Extra != "" {
				sec.Extra = &Step{Title: s.Prefix + "." + s.Extra + ".title", Text: s.Prefix + "." + s.Extra + ".text"}
			}
		case common.AboutCompare:
			sec.Subtitle = s.FieldKey("subtitle")
			for _, col := range s.Cols {
				sec.Cols = append(sec.Cols, Column{Label: s.FieldKey(col + ".label"), Items: s.ColItemKeys(col)})
			}
			if s.Note {
				sec.Note = s.FieldKey("note")
			}
			// the cap is quoted only where there is a cap and a plan that lifts it
			if s.Cap != "" && cfg.offers != nil && cfg.offers.HasPlans() && cfg.offers.FreeRateMbps() > 0 {
				sec.Cap = s.FieldKey(s.Cap)
				sec.Rate = cfg.offers.FreeRateMbps()
			}
		}
		if s.Footer {
			sec.Footer = s.FieldKey("footer")
		}
		out.Sections = append(out.Sections, sec)
	}
	return out
}

func onboarding(c *models.OnboardingChecklist) *Onboarding {
	if c == nil || len(c.Steps) == 0 {
		return nil
	}
	out := &Onboarding{Done: c.Done, Total: c.Total, Steps: []OnboardingStep{}}
	for _, s := range c.Steps {
		out.Steps = append(out.Steps, OnboardingStep{
			Key:      string(s.Key),
			Done:     s.Done,
			Locked:   s.Locked,
			Title:    s.TitleKey,
			Desc:     s.DescKey,
			CTA:      s.CTAKey,
			CTACount: s.CTACount,
			Path:     s.Path,
			Fragment: s.Fragment,
		})
	}
	return out
}

// FAQItem is one question of the FAQ under the home and tool pages. Answers
// may carry markup (<a>, <strong>); Params fill their placeholders.
type FAQItem struct {
	Q      string         `json:"q"`
	A      []string       `json:"a"`
	Params map[string]int `json:"params,omitempty"`
	// Guide is the tool page holding the long answer, linked under it.
	Guide string `json:"guide,omitempty"`
}

// faq is the list templates/partials/about.html renders, in its order and
// with its exclusions: a guide leaves out the questions it answers itself,
// and the AI questions appear only where AI runs.
func (cfg *config) faq(tool *common.Tool) []FAQItem {
	self := ""
	if tool != nil {
		self = tool.Url
	}
	q := func(name string, guide string) FAQItem {
		item := FAQItem{Q: "about.faq." + name + ".q", A: []string{"about.faq." + name + ".a"}}
		if guide != self {
			item.Guide = guide
		}
		return item
	}
	out := []FAQItem{
		q("free", ""), q("vpn", ""), q("mobile", ""), q("formats", ""),
		q("opensource", ""), q("smarttv", ""), q("indexers", ""), q("releaseSubs", ""),
	}
	if self != "open-torrent-file" {
		out = append(out, q("openTorrent", "open-torrent-file"), q("openTorrentApp", "open-torrent-file"))
	}
	out = append(out, q("magnetDownload", ""), q("magnetUse", ""))
	if self != "how-to-download-torrent-files" {
		out = append(out, q("downloadTorrented", "how-to-download-torrent-files"))
	}
	if self != "open-torrents-on-pc" {
		out = append(out, q("unzipTorrent", "open-torrents-on-pc"))
	}
	if cfg.ai.AiEnabled() {
		out = append(out, q("aiDiscover", ""))
		quota := q("aiQuota", "")
		quota.Params = map[string]int{"FreeQuota": cfg.ai.AiFreeQuota(), "PaidQuota": cfg.ai.AiPaidQuota()}
		out = append(out, quota)
		model := FAQItem{Q: "about.faq.aiModel.q", A: []string{"about.faq.aiModel.anthropic"}}
		if cfg.ai.AiProvider() == "openai" {
			model.A = []string{"about.faq.aiModel.openai"}
		}
		out = append(out, model)
	}
	out = append(out, q("expire", ""), q("zip", ""))
	out = append(out, FAQItem{Q: "about.faq.speed.q", A: []string{"about.faq.speed.a1", "about.faq.speed.a2"}})
	out = append(out, q("streamVsDownload", ""))
	if tool != nil {
		for _, pair := range tool.FaqPairs() {
			out = append(out, FAQItem{Q: pair[0], A: []string{pair[1]}})
		}
	}
	return out
}
