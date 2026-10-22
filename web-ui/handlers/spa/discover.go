package spa

import (
	"time"

	"github.com/webtor-io/web-ui/handlers/discover"
	"github.com/webtor-io/web-ui/services/web"
)

func init() { page("discover/index", (*config).discover) }

// Discover is the Discover page (/discover): what templates/views/discover/
// index.html put on window for the Preact app (_addons, _indexers,
// _streamPrefs, _aiEnabled, _passthrough). Everything else the page shows it
// fetches itself, from the user's Stremio addons and the /discover/* JSON
// endpoints.
type Discover struct {
	Addons      []DiscoverAddon   `json:"addons"`
	Indexers    []DiscoverIndexer `json:"indexers"`
	StreamPrefs StreamPrefs       `json:"streamPrefs"`
	AIEnabled   bool              `json:"aiEnabled"`
	Passthrough Passthrough       `json:"passthrough"`
}

// DiscoverAddon is one of the user's Stremio addons with the manifest
// snapshot taken when it was added (handlers/discover addonView).
type DiscoverAddon struct {
	ID         string     `json:"id"`
	URL        string     `json:"url"`
	Name       string     `json:"name,omitempty"`
	Logo       string     `json:"logo,omitempty"`
	ManifestID string     `json:"manifestId,omitempty"`
	Version    string     `json:"version,omitempty"`
	Resources  []string   `json:"resources,omitempty"`
	Types      []string   `json:"types,omitempty"`
	FetchedAt  *time.Time `json:"fetchedAt,omitempty"`
}

type DiscoverIndexer struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// StreamPrefs are the account's stream settings: enabled resolutions (empty
// is no preference) and the preferred language code.
type StreamPrefs struct {
	Resolutions []string `json:"resolutions"`
	Language    string   `json:"language"`
}

// Passthrough is the transcoder's last answer on handing HEVC through:
// "on", "off" or "unknown".
type Passthrough struct {
	HEVC string `json:"hevc"`
}

func (cfg *config) discover(ctx *web.Context) (any, error) {
	d, ok := ctx.Data.(*discover.IndexData)
	if !ok || d == nil {
		return nil, errNoData
	}
	out := &Discover{
		Addons:      []DiscoverAddon{},
		Indexers:    []DiscoverIndexer{},
		StreamPrefs: StreamPrefs{Resolutions: d.Prefs.Resolutions, Language: d.Prefs.Language},
		AIEnabled:   d.AIEnabled,
		Passthrough: Passthrough{HEVC: d.Passthrough.HEVC},
	}
	if out.StreamPrefs.Resolutions == nil {
		out.StreamPrefs.Resolutions = []string{}
	}
	for _, a := range d.Addons {
		out.Addons = append(out.Addons, DiscoverAddon{
			ID:         a.ID,
			URL:        a.URL,
			Name:       a.Name,
			Logo:       a.Logo,
			ManifestID: a.ManifestID,
			Version:    a.Version,
			Resources:  a.Resources,
			Types:      a.Types,
			FetchedAt:  a.FetchedAt,
		})
	}
	for _, i := range d.Indexers {
		out.Indexers = append(out.Indexers, DiscoverIndexer{ID: i.ID, Name: i.Name})
	}
	return out, nil
}
