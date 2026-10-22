package spa

import (
	"github.com/webtor-io/web-ui/handlers/auth"
	"github.com/webtor-io/web-ui/services/web"
)

func init() {
	page("auth/login", (*config).login)
	page("auth/password", (*config).passwordLogin)
	page("auth/verify", (*config).authReturn)
	page("auth/callback", (*config).authReturn)
	page("auth/logout", (*config).empty)
	page("auth/refresh", (*config).empty)
}

// Login is /login with SuperTokens: magic link and the OAuth providers.
type Login struct {
	Instruction string     `json:"instruction"`
	Card        *LoginCard `json:"card,omitempty"`
}

type LoginCard struct {
	Note     string   `json:"note"`
	Intro    string   `json:"intro"`
	Features []string `json:"features"`
}

// PasswordLogin is /login on a self-hosted instance with an administrator
// password.
type PasswordLogin struct {
	Err string `json:"err,omitempty"`
}

// AuthReturn is where /auth/verify and /auth/callback go once signed in.
type AuthReturn struct {
	ReturnURL string `json:"returnUrl"`
}

func (cfg *config) login(ctx *web.Context) (any, error) {
	var d *auth.LoginData
	switch v := ctx.Data.(type) {
	case auth.LoginData:
		d = &v
	case *auth.LoginData:
		d = v
	}
	out := &Login{}
	if d != nil {
		out.Instruction = d.Instruction
		if c := d.Card; c != nil {
			out.Card = &LoginCard{Note: c.NoteKey, Intro: c.IntroKey, Features: c.FeatureKeys}
		}
	}
	return out, nil
}

func (cfg *config) passwordLogin(ctx *web.Context) (any, error) {
	out := &PasswordLogin{}
	switch v := ctx.Data.(type) {
	case auth.PasswordLoginData:
		out.Err = v.Err
	case *auth.PasswordLoginData:
		if v != nil {
			out.Err = v.Err
		}
	}
	return out, nil
}

func (cfg *config) authReturn(ctx *web.Context) (any, error) {
	out := &AuthReturn{ReturnURL: web.LangURL(ctx.Lang, "/")}
	switch v := ctx.Data.(type) {
	case auth.ProcessAuthData:
		if v.ReturnURL != "" {
			out.ReturnURL = v.ReturnURL
		}
	case *auth.ProcessAuthData:
		if v != nil && v.ReturnURL != "" {
			out.ReturnURL = v.ReturnURL
		}
	}
	return out, nil
}

// empty serves pages whose state is all in the session (sign-out, the
// session refresh interstitial).
func (cfg *config) empty(*web.Context) (any, error) {
	return struct{}{}, nil
}
