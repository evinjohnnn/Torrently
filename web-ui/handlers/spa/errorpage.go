package spa

import "github.com/webtor-io/web-ui/services/web"

func init() { page("error/page", (*config).errorPage) }

// ErrorPage is the page every failing route renders (web.ErrorHandler, an
// unknown legal page). What went wrong travels as the state's error key and
// its status code; there is nothing else to show.
type ErrorPage struct{}

func (cfg *config) errorPage(_ *web.Context) (any, error) {
	return &ErrorPage{}, nil
}
