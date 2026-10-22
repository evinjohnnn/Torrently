package spa

import (
	"github.com/webtor-io/web-ui/handlers/common"
	"github.com/webtor-io/web-ui/services/web"
)

// Session is the request state every page shares: who is signed in, the
// tokens a mutation needs, and the instance's switches. It is what the
// templates read from web.Context, minus the handler data.
type Session struct {
	CSRF      string `json:"csrf"`
	SessionID string `json:"sessionId"`
	Lang      string `json:"lang"`
	Path      string `json:"path"`
	Domain    string `json:"domain"`
	User      *User  `json:"user"`
	// Tier is the plan name ("free" when nothing is paid for).
	Tier        string `json:"tier"`
	TierID      int    `json:"tierId"`
	ShowAdult   bool   `json:"showAdult"`
	SuggestLang string `json:"suggestLang,omitempty"`
	// OpenInstance: a self-hosted instance with no administrator password.
	OpenInstance        bool `json:"openInstance"`
	Vault               bool `json:"vault"`
	UnreadNotifications int  `json:"unreadNotifications"`
	SuperTokens         bool `json:"superTokens"`
	// Turnstile is the site key anonymous visitors solve before a job
	// starts; empty when no check is needed.
	Turnstile string `json:"turnstile,omitempty"`
	Umami     any    `json:"umami,omitempty"`
	// What this deployment offers, for links that only make sense when it
	// does: embedding, the API reference, the support form and legal pages.
	Embed   bool       `json:"embed"`
	APIDocs string     `json:"apiDocs"`
	Support bool       `json:"support"`
	Tools   []ToolLink `json:"tools"`
	// LegacyCSS is loaded next to server-rendered cards the app hosts.
	LegacyCSS string `json:"legacyCss"`
}

// ToolLink is one of the landing pages the footer lists.
type ToolLink struct {
	URL   string `json:"url"`
	Title string `json:"title"`
	Guide bool   `json:"guide"`
}

var toolLinks = func() []ToolLink {
	out := make([]ToolLink, 0, len(common.Tools))
	for _, t := range common.Tools {
		out = append(out, ToolLink{URL: t.Url, Title: t.Title, Guide: t.Guide})
	}
	return out
}()

type User struct {
	Email string `json:"email"`
	IsNew bool   `json:"isNew"`
}

func (s *Service) session(ctx *web.Context) Session {
	out := Session{
		CSRF:                ctx.CSRF,
		SessionID:           ctx.SessionID,
		Lang:                ctx.Lang,
		Path:                ctx.Path,
		Domain:              s.domain,
		Tier:                "free",
		SuggestLang:         ctx.SuggestLang,
		OpenInstance:        ctx.OpenInstance,
		Vault:               ctx.Vault,
		UnreadNotifications: ctx.UnreadNotifications,
		SuperTokens:         s.useST,
		Embed:               s.embed,
		APIDocs:             s.apiDocs,
		Support:             s.support,
		Tools:               toolLinks,
		LegacyCSS:           s.legacyCSS(),
	}
	if ctx.UserSettings != nil {
		out.ShowAdult = ctx.UserSettings.ShowAdult
	}
	signedIn := ctx.User != nil && ctx.User.HasAuth()
	if signedIn {
		out.User = &User{Email: ctx.User.Email, IsNew: ctx.User.IsNew}
	}
	if cl := ctx.Claims; cl != nil && cl.Context != nil && cl.Context.Tier != nil {
		out.Tier = cl.Context.Tier.Name
		out.TierID = int(cl.Context.Tier.Id)
	}
	if !signedIn && s.turnstile.UseActionTurnstile() {
		out.Turnstile = s.turnstile.ActionTurnstileSiteKey()
	}
	if s.umami.UseUmami() {
		out.Umami = s.umami.UmamiConfig()
	}
	return out
}
