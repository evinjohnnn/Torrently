package spa

import (
	"github.com/webtor-io/web-ui/handlers/action"
	"github.com/webtor-io/web-ui/services/web"
)

func init() { fragment("action/post", (*config).actionJob) }

// Job is the answer to a job start (POST /stream-video, /download-file, …):
// where its log is. A refused start has no log and carries the page error.
type Job struct {
	LogURL string `json:"logUrl,omitempty"`
}

func (cfg *config) actionJob(ctx *web.Context) (any, error) {
	out := &Job{}
	var d *action.PostData
	switch v := ctx.Data.(type) {
	case action.PostData: // the handler passes it by value
		d = &v
	case *action.PostData:
		d = v
	}
	if d != nil && d.Job != nil {
		out.LogURL = web.LangURL(ctx.Lang, "/queue/"+d.Job.Queue+"/job/"+d.Job.ID+"/log")
	}
	return out, nil
}
