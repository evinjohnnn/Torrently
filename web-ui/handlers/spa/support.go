package spa

import (
	"sort"

	"github.com/webtor-io/web-ui/handlers/support"
	"github.com/webtor-io/web-ui/services/web"
)

func init() {
	page("support/form", (*config).support)
	page("support/success", (*config).support)
}

// Support is the help center form (GET and POST /support) and the page
// after it was sent. A failed send comes back with the form as it was.
type Support struct {
	Causes []SupportCause `json:"causes"`
	Form   SupportForm    `json:"form"`
	// Turnstile is the site key of the form's check; empty when the
	// instance does not check.
	Turnstile string `json:"turnstile,omitempty"`
}

// SupportCause is one option of the cause select, in the template's order
// (by id; -1 is the disabled placeholder).
type SupportCause struct {
	ID  int    `json:"id"`
	Key string `json:"key"`
}

type SupportForm struct {
	Cause       int    `json:"cause"`
	Subject     string `json:"subject"`
	Description string `json:"description"`
	Infohash    string `json:"infohash"`
	Filename    string `json:"filename"`
	Email       string `json:"email"`
	Work        string `json:"work"`
}

func (cfg *config) support(ctx *web.Context) (any, error) {
	d, ok := ctx.Data.(*support.Data)
	if !ok {
		return nil, errNoData
	}
	out := &Support{Form: SupportForm{Cause: -1}}
	if cfg.turnstile.UseTurnstile() {
		out.Turnstile = cfg.turnstile.TurnstileSiteKey()
	}
	for id, key := range d.CauseTypes {
		out.Causes = append(out.Causes, SupportCause{ID: id, Key: key})
	}
	sort.Slice(out.Causes, func(i, j int) bool { return out.Causes[i].ID < out.Causes[j].ID })
	if f := d.Form; f != nil {
		out.Form = SupportForm{
			Cause:       int(f.Cause),
			Subject:     f.Subject,
			Description: f.Description,
			Infohash:    f.Infohash,
			Filename:    f.Filename,
			Email:       f.Email,
			Work:        f.Work,
		}
	}
	return out, nil
}
