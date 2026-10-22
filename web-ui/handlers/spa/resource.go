package spa

import (
	"net/url"

	ra "github.com/webtor-io/rest-api/services"

	"github.com/webtor-io/web-ui/handlers/resource"
	"github.com/webtor-io/web-ui/services/pagination"
	"github.com/webtor-io/web-ui/services/statusview"
	"github.com/webtor-io/web-ui/services/web"
)

func init() { page("resource/get", (*config).torrent) }

// Torrent is the torrent page ("resource/get").
type Torrent struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Magnet     string `json:"magnet"`
	Size       int64  `json:"size"`
	FilesCount int    `json:"filesCount"`
	InLibrary  bool   `json:"inLibrary"`
	TorrentURL string `json:"torrentUrl"`
	Poster     string `json:"poster"`
	// Adult is the classification; AdultBadge whether this viewer sees the
	// 18+ mark over the poster (they have not opted in to adult content).
	Adult      bool      `json:"adult"`
	AdultBadge bool      `json:"adultBadge"`
	Kind       string    `json:"kind"` // movie | series | torrent
	Enriched   *Enriched `json:"enriched,omitempty"`
	// FromTool is the tool page the visit started on (?tool=).
	FromTool string  `json:"fromTool,omitempty"`
	Vault    *Vault  `json:"vault,omitempty"`
	Status   *Status `json:"status,omitempty"`
	File     *File   `json:"file,omitempty"`
	List     *List   `json:"list,omitempty"`
}

type Enriched struct {
	Title  string  `json:"title"`
	Year   int     `json:"year,omitempty"`
	Rating float64 `json:"rating,omitempty"`
	Plot   string  `json:"plot,omitempty"`
}

// Vault is the Save-to-Vault button, and its dialogs when the page was asked
// for them (?pledge-form=true, ?pledge-remove-form=true, or the redirect
// back from /vault/add and /vault/remove).
type Vault struct {
	Funded bool         `json:"funded"`
	Add    *VaultAdd    `json:"add,omitempty"`
	Remove *VaultRemove `json:"remove,omitempty"`
}

type VaultAdd struct {
	Status    string   `json:"status,omitempty"` // "" | success | error
	ErrKey    string   `json:"errKey,omitempty"`
	Funded    bool     `json:"funded"`
	Vaulted   bool     `json:"vaulted"`
	Required  float64  `json:"required"`
	Available *float64 `json:"available"`
	Total     *float64 `json:"total"`
	SizeGB    float64  `json:"sizeGb"`
}

type VaultRemove struct {
	Status string `json:"status,omitempty"`
	ErrKey string `json:"errKey,omitempty"`
	Frozen bool   `json:"frozen"`
}

// Status is the transfer status: the first view (services/statusview) and
// where its stream lives (GET /:id/status, server-sent events).
type Status struct {
	View      *statusview.View `json:"view"`
	StreamURL string           `json:"streamUrl"`
}

// Action is one button that starts a job (POST <endpoint> with resource-id
// and item-id).
type Action struct {
	Action   string `json:"action"` // stream | preview | download | file-info | download-dir
	Endpoint string `json:"endpoint"`
	Label    string `json:"label"`
	Size     string `json:"size,omitempty"`
	ItemID   string `json:"itemId"`
}

// Watched is the watched toggle of a movie or an episode file.
type Watched struct {
	Watched   bool   `json:"watched"`
	MarkURL   string `json:"markUrl"`
	UnmarkURL string `json:"unmarkUrl"`
}

type File struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Path        string   `json:"path"`
	Size        int64    `json:"size"`
	MediaFormat string   `json:"mediaFormat,omitempty"`
	Actions     []Action `json:"actions"`
	Watched     *Watched `json:"watched,omitempty"`
}

type Entry struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Path        string   `json:"path"`
	Type        string   `json:"type"` // file | directory
	Size        int64    `json:"size"`
	MediaFormat string   `json:"mediaFormat,omitempty"`
	Watched     *Watched `json:"watched,omitempty"`
}

type List struct {
	ID          string            `json:"id"`
	Path        string            `json:"path"`
	Size        int64             `json:"size"`
	Count       int               `json:"count"`
	Page        uint              `json:"page"`
	Pages       []pagination.Item `json:"pages,omitempty"`
	Breadcrumbs []Crumb           `json:"breadcrumbs"`
	Items       []Entry           `json:"items"`
	Archive     Action            `json:"archive"`
}

type Crumb struct {
	Name string `json:"name"`
	Path string `json:"path"`
}

func (cfg *config) torrent(ctx *web.Context) (any, error) {
	d, ok := ctx.Data.(*resource.GetData)
	if !ok || d == nil || d.Resource == nil {
		return nil, errNoData
	}
	h := cfg.resource
	r := d.Resource
	out := &Torrent{
		ID:         r.ID,
		Name:       r.Name,
		Magnet:     r.MagnetURI,
		Size:       r.Size,
		FilesCount: r.FilesCount,
		InLibrary:  r.InLibrary,
		TorrentURL: h.TorrentFileURL(r),
		Poster:     h.GetResourcePosterURL(d, 480, ctx),
		Adult:      h.IsAdult(d),
		AdultBadge: web.ShowAdultBadge(h.IsAdult(d), ctx),
		Kind:       "torrent",
	}
	switch {
	case h.IsEnrichedMovie(d):
		out.Kind = "movie"
	case h.IsEnrichedSeries(d):
		out.Kind = "series"
	}
	if h.HasEnrichment(d) {
		out.Enriched = &Enriched{
			Title:  h.GetEnrichedTitle(d),
			Year:   h.GetEnrichedYear(d),
			Rating: h.GetEnrichedRating(d),
			Plot:   h.GetEnrichedPlot(d),
		}
	}
	if d.Args != nil && d.Args.FromTool != nil {
		out.FromTool = d.Args.FromTool.Url
	}
	if d.Vault && d.VaultButton != nil {
		v := &Vault{Funded: d.VaultButton.Funded}
		if f := d.VaultPledgeAddForm; f != nil {
			v.Add = &VaultAdd{
				Status: f.Status, ErrKey: f.ErrKey, Funded: f.Funded, Vaulted: f.Vaulted,
				Required: f.Required, Available: f.Available, Total: f.Total, SizeGB: f.TorrentSizeGB,
			}
		}
		if f := d.VaultPledgeRemoveForm; f != nil {
			v.Remove = &VaultRemove{Status: f.Status, ErrKey: f.ErrKey, Frozen: f.Frozen}
		}
		out.Vault = v
	}
	if d.StatusView != nil {
		q := url.Values{}
		q.Set("_csrf", ctx.CSRF)
		q.Set("session", "1")
		if tok := h.StatusToken(r.ID); tok != "" {
			q.Set("token", tok)
		}
		if d.Item != nil {
			q.Set("file", d.Item.PathStr)
		}
		out.Status = &Status{View: d.StatusView, StreamURL: "/" + r.ID + "/status?" + q.Encode()}
	}
	if d.Item != nil {
		out.File = fileOf(ctx, h, d)
	}
	if d.List != nil {
		out.List = listOf(ctx, h, d)
	}
	return out, nil
}

func watchedOf(d *resource.GetData, path string) *Watched {
	a, ok := d.PathActions[path]
	if !ok || a == nil {
		return nil
	}
	return &Watched{Watched: d.WatchedPaths[path], MarkURL: a.MarkURL, UnmarkURL: a.UnmarkURL}
}

func actionOf(b *resource.ButtonItem) Action {
	return Action{Action: b.Action, Endpoint: b.Endpoint, Label: b.Name, Size: b.Size, ItemID: b.ItemID}
}

func fileOf(ctx *web.Context, h *resource.Helper, d *resource.GetData) *File {
	it := d.Item
	f := &File{
		ID:          it.ID,
		Name:        it.Name,
		Path:        it.PathStr,
		Size:        it.Size,
		MediaFormat: string(it.MediaFormat),
		Actions:     []Action{},
	}
	switch it.MediaFormat {
	case ra.Video:
		f.Actions = append(f.Actions, actionOf(h.MakeVideo(ctx, d)))
	case ra.Audio:
		f.Actions = append(f.Actions, actionOf(h.MakeAudio(ctx, d)))
	case ra.Image:
		f.Actions = append(f.Actions, actionOf(h.MakeImage(ctx, d)))
	}
	f.Actions = append(f.Actions, actionOf(h.MakeFileDownload(ctx, d)))
	if it.MediaFormat == ra.Video || it.MediaFormat == ra.Audio {
		f.Actions = append(f.Actions, actionOf(h.MakeFileInfo(ctx, d)))
	}
	if ctx.User != nil && ctx.User.HasAuth() {
		f.Watched = watchedOf(d, it.PathStr)
	}
	return f
}

func listOf(ctx *web.Context, h *resource.Helper, d *resource.GetData) *List {
	l := d.List
	out := &List{
		ID:          l.ID,
		Path:        l.PathStr,
		Size:        l.Size,
		Count:       l.Count,
		Breadcrumbs: []Crumb{},
		Items:       []Entry{},
		Archive:     actionOf(h.MakeDirDownload(ctx, d)),
	}
	if d.Args != nil {
		out.Page = d.Args.Page
		if h.HasPagination(l) {
			out.Pages = h.MakePagination(l, d.Args.Page, d.Args.PageSize)
		}
	}
	for _, b := range h.MakeBreadcrumbs(l.PathStr) {
		out.Breadcrumbs = append(out.Breadcrumbs, Crumb{Name: b.Name, Path: b.PathStr})
	}
	signedIn := ctx.User != nil && ctx.User.HasAuth()
	for _, it := range l.Items {
		e := Entry{
			ID:          it.ID,
			Name:        it.Name,
			Path:        it.PathStr,
			Type:        string(it.Type),
			Size:        it.Size,
			MediaFormat: string(it.MediaFormat),
		}
		if signedIn && it.Type == ra.ListTypeFile {
			e.Watched = watchedOf(d, it.PathStr)
		}
		out.Items = append(out.Items, e)
	}
	return out
}
