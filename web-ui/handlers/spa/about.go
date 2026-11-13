package spa

import "github.com/webtor-io/web-ui/services/web"

func init() { page("about/index", (*config).about) }

// About is /about: its copy is all in the aboutPage.* strings.
type About struct{}

func (cfg *config) about(_ *web.Context) (any, error) {
	return &About{}, nil
}
