package spa

import (
	"time"

	"github.com/webtor-io/web-ui/handlers/notifications"
	"github.com/webtor-io/web-ui/services/web"
)

func init() { page("notifications/get", (*config).notifications) }

// Notifications is the feed behind the navbar bell ("notifications/get").
type Notifications struct {
	Items []Notification `json:"items"`
}

// Notification is one row. Body is markup the notification renderer
// escaped when it stored it (see handlers/notifications.Item): the page
// inserts it as HTML, as the template does.
type Notification struct {
	Title     string    `json:"title"`
	Body      string    `json:"body"`
	Read      bool      `json:"read"`
	CreatedAt time.Time `json:"createdAt"`
}

func (cfg *config) notifications(ctx *web.Context) (any, error) {
	d, ok := ctx.Data.(*notifications.Data)
	if !ok || d == nil {
		return nil, errNoData
	}
	out := &Notifications{Items: []Notification{}}
	for _, n := range d.Notifications {
		out.Items = append(out.Items, Notification{
			Title:     n.Title,
			Body:      string(n.Body),
			Read:      n.ReadAt != nil,
			CreatedAt: n.CreatedAt,
		})
	}
	return out, nil
}
