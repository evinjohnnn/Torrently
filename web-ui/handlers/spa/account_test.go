package spa

import (
	"html/template"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/webtor-io/web-ui/handlers/device"
	"github.com/webtor-io/web-ui/handlers/library"
	"github.com/webtor-io/web-ui/handlers/library/shared"
	"github.com/webtor-io/web-ui/handlers/notifications"
	rs "github.com/webtor-io/web-ui/handlers/release_subscription"
	"github.com/webtor-io/web-ui/handlers/resource"
	"github.com/webtor-io/web-ui/handlers/vault"
	"github.com/webtor-io/web-ui/models"
	vaultModels "github.com/webtor-io/web-ui/models/vault"
	vs "github.com/webtor-io/web-ui/services/vault"
	"github.com/webtor-io/web-ui/services/web"
)

func testConfig() *config {
	return &config{resource: resource.NewHelper("secret")}
}

func i16(v int16) *int16 { return &v }

// Every builder refuses data it was not written for: the takeover then
// serves the template instead of a page with holes in it.
func TestAccountBuildersRefuseForeignData(t *testing.T) {
	cfg := testConfig()
	ctx := &web.Context{Data: struct{}{}}
	for name, b := range map[string]builder{
		"library": (*config).library, "notifications": (*config).notifications, "vault": (*config).vault,
		"device": (*config).device, "unsubscribeConfirm": (*config).unsubscribeConfirm, "unsubscribed": (*config).unsubscribed,
	} {
		if _, err := b(cfg, ctx); err != errNoData {
			t.Errorf("%s: expected errNoData, got %v", name, err)
		}
	}
}

func TestLibraryTorrents(t *testing.T) {
	added := time.Now()
	ctx := &web.Context{Lang: "en", Data: &library.IndexData{
		Args: &shared.IndexArgs{Section: shared.SectionTypeTorrents, Sort: models.SortTypeName},
		Items: []any{
			&models.Library{ResourceID: "a", Name: "stored", CreatedAt: added,
				Torrent: &models.TorrentResource{Name: "Sintel", SizeBytes: 10, FileCount: 2}},
			// a row whose torrent is not loaded keeps its own name
			&models.Library{ResourceID: "b", Name: "fallback"},
		},
		TorrentCount: 2, MovieCount: 1,
		RateForm: &library.RateFormData{VideoID: "tt1", Type: "movie"},
	}}
	got, err := testConfig().library(ctx)
	if err != nil {
		t.Fatal(err)
	}
	l := got.(*Library)
	if l.Section != "torrents" || l.Sort != int(models.SortTypeName) || l.Counts.Movies != 1 {
		t.Errorf("unexpected header: %+v", l)
	}
	if len(l.Sorts) != 2 || l.Sorts[1].Title != "library.sort.name" {
		t.Errorf("torrents sort by recently added and name, got %+v", l.Sorts)
	}
	if len(l.Torrents) != 2 || l.Torrents[0].Name != "Sintel" || l.Torrents[0].Files != 2 || l.Torrents[1].Name != "fallback" {
		t.Errorf("unexpected torrents: %+v", l.Torrents)
	}
	if l.Rate != nil {
		t.Error("the torrents section has nothing to rate")
	}
}

func TestLibraryVideos(t *testing.T) {
	ctx := &web.Context{Lang: "en", Data: &library.IndexData{
		Args: &shared.IndexArgs{Section: shared.SectionTypeMovies, Watched: shared.WatchedFilterWatched},
		Items: []any{&models.Movie{
			VideoContent:     &models.VideoContent{ResourceID: "r1", Title: "raw"},
			MovieMetadata:    &models.MovieMetadata{VideoMetadata: &models.VideoMetadata{VideoID: "tt1", Title: "Sintel", Year: i16(2010)}},
			ResourceMetadata: &models.ResourceMetadata{IsAdult: true},
			UserWatched:      true,
			UserRating:       i16(8),
		}},
		RateForm: &library.RateFormData{VideoID: "tt1", Type: "movie", CurrentRating: 8},
	}}
	got, err := testConfig().library(ctx)
	if err != nil {
		t.Fatal(err)
	}
	l := got.(*Library)
	if l.Watched != "watched" || len(l.Sorts) != 4 {
		t.Errorf("unexpected filter or sorts: %q %+v", l.Watched, l.Sorts)
	}
	v := l.Videos[0]
	if v.ResourceID != "r1" || v.VideoID != "tt1" || v.Type != "movie" || v.Title != "Sintel" || v.Year != 2010 ||
		!v.Watched || v.UserRating != 8 || !v.AdultBadge || v.Poster == "" {
		t.Errorf("unexpected video: %+v", v)
	}
	if l.Rate == nil || l.Rate.VideoID != "tt1" || l.Rate.Current != 8 {
		t.Errorf("unexpected rate: %+v", l.Rate)
	}
}

func TestNotifications(t *testing.T) {
	read := time.Now()
	ctx := &web.Context{Data: &notifications.Data{Notifications: []notifications.Item{
		{Title: "a", Body: template.HTML("<p>x</p>")},
		{Title: "b", ReadAt: &read},
	}}}
	got, err := testConfig().notifications(ctx)
	if err != nil {
		t.Fatal(err)
	}
	items := got.(*Notifications).Items
	if len(items) != 2 || items[0].Read || !items[1].Read || items[0].Body != "<p>x</p>" {
		t.Errorf("unexpected items: %+v", items)
	}
}

func TestVaultRows(t *testing.T) {
	total := 10.0
	ctx := &web.Context{Lang: "ru", CSRF: "c", Data: &vault.PledgeListData{
		Stats: &vs.UserStats{Total: &total, Funded: 2},
		Pledges: []vault.PledgeDisplay{
			{ResourceID: "gone"},
			{ResourceID: "live", Resource: &vaultModels.Resource{Name: "Live", Funded: true}, Funded: true, ShowProgress: true, Amount: 1.5},
			{ResourceID: "old", Resource: &vaultModels.Resource{Name: "Old"}, ExpiresIn: 90 * time.Minute, IsFrozen: true},
		},
	}}
	got, err := testConfig().vault(ctx)
	if err != nil {
		t.Fatal(err)
	}
	v := got.(*VaultPage)
	if v.Stats == nil || *v.Stats.Total != 10 || v.Stats.Available != nil {
		t.Errorf("unexpected stats: %+v", v.Stats)
	}
	if len(v.Pledges) != 2 {
		t.Fatalf("a pledge whose torrent is gone is skipped, got %+v", v.Pledges)
	}
	live, old := v.Pledges[0], v.Pledges[1]
	u, err := url.Parse(live.StreamURL)
	if err != nil || u.Path != "/ru/live/status" || u.Query().Get("_csrf") != "c" || u.Query().Get("token") == "" || u.Query().Has("session") {
		t.Errorf("unexpected stream url %q", live.StreamURL)
	}
	if old.StreamURL != "" || old.ExpiresIn != 5400 || !old.Frozen {
		t.Errorf("unexpected row: %+v", old)
	}
}

func TestDeviceAndUnsubscribe(t *testing.T) {
	cfg := testConfig()
	d, _ := cfg.device(&web.Context{Data: &device.Data{State: "confirm", Code: "ABCD-EFGH", DeviceName: "TV"}})
	if dv := d.(*Device); dv.State != "confirm" || dv.Code != "ABCD-EFGH" || dv.DeviceName != "TV" {
		t.Errorf("unexpected device: %+v", dv)
	}
	c, _ := cfg.unsubscribeConfirm(&web.Context{Data: &rs.UnsubscribeConfirmData{Title: "T", Token: "tok"}})
	if u := c.(*Unsubscribe); u.Done || u.Token != "tok" {
		t.Errorf("unexpected confirm: %+v", u)
	}
	done, _ := cfg.unsubscribed(&web.Context{Data: &rs.UnsubscribedData{Failed: true}})
	if u := done.(*Unsubscribe); !u.Done || !u.Failed || strings.TrimSpace(u.Token) != "" {
		t.Errorf("unexpected answer: %+v", u)
	}
}
