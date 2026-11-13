package spa

import (
	rs "github.com/webtor-io/web-ui/handlers/release_subscription"
	"github.com/webtor-io/web-ui/services/web"
)

func init() {
	page("subscription/unsubscribe_confirm", (*config).unsubscribeConfirm)
	page("subscription/unsubscribed", (*config).unsubscribed)
}

// Unsubscribe is the page an email's unsubscribe link opens: the question
// (GET, Token set) and the answer to its form (POST, Done set). Title is
// the release subscription's title when it is known.
type Unsubscribe struct {
	Title  string `json:"title,omitempty"`
	Token  string `json:"token,omitempty"`
	Done   bool   `json:"done"`
	Failed bool   `json:"failed"`
}

func (cfg *config) unsubscribeConfirm(ctx *web.Context) (any, error) {
	d, ok := ctx.Data.(*rs.UnsubscribeConfirmData)
	if !ok || d == nil {
		return nil, errNoData
	}
	return &Unsubscribe{Title: d.Title, Token: d.Token}, nil
}

func (cfg *config) unsubscribed(ctx *web.Context) (any, error) {
	d, ok := ctx.Data.(*rs.UnsubscribedData)
	if !ok || d == nil {
		return nil, errNoData
	}
	return &Unsubscribe{Title: d.Title, Done: true, Failed: d.Failed}, nil
}
