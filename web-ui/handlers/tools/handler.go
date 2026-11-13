package tools

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/webtor-io/web-ui/services/template"
	"github.com/webtor-io/web-ui/services/web"
)

type Handler struct {
	tb template.Builder[*web.Context]
}

// RegisterHandler serves /tools: every tool page in one list. The tools
// themselves are common.Tools; this page has no data of its own.
func RegisterHandler(r *gin.Engine, tm *template.Manager[*web.Context]) {
	h := &Handler{
		tb: tm.MustRegisterViews("tools/*").WithLayout("main"),
	}

	r.GET("/tools", web.IndexFollow(), h.get)
}

func (s *Handler) get(c *gin.Context) {
	s.tb.Build("tools/index").HTML(http.StatusOK, web.NewContext(c))
}
