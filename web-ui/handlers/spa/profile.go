package spa

import (
	"time"

	"github.com/webtor-io/web-ui/handlers/profile"
	"github.com/webtor-io/web-ui/models"
	"github.com/webtor-io/web-ui/services/claims"
	"github.com/webtor-io/web-ui/services/stremio"
	"github.com/webtor-io/web-ui/services/web"
)

func init() {
	page("profile/get", (*config).profile)
	page("profile/email_verified", (*config).emailVerified)
}

// freeListLimit is how many addons, indexers and embed domains a free account
// may keep (the handlers refuse the fourth; the templates disable the form).
const freeListLimit = 3

// Profile is the settings page (/profile). Each section is its own form and
// posts to its own handler, which redirects back here: the page comes back
// whole, and ErrKey/ErrFrom say which form failed.
type Profile struct {
	Tier ProfileTier `json:"tier"`
	// Paid unlocks WebDAV, S3, the API, the built-in backend and lifts the
	// list limits (the templates' isPaid).
	Paid bool `json:"paid"`
	// ErrKey is the error a form came back with (?err=), ErrFrom the path it
	// posted to (?from=), so the page shows it under the right section.
	ErrKey       string         `json:"errKey,omitempty"`
	ErrFrom      string         `json:"errFrom,omitempty"`
	HasPayments  bool           `json:"hasPayments"`
	Billing      *Billing       `json:"billing,omitempty"`
	Vault        *ProfileVault  `json:"vault,omitempty"`
	Stremio      ProfileStremio `json:"stremio"`
	Backends     []Backend      `json:"backends"`
	BackendTypes []BackendType  `json:"backendTypes"`
	Addons       []Addon        `json:"addons"`
	Indexers     []Indexer      `json:"indexers"`
	// ListLimit caps addons and indexers; 0 when the plan has no cap.
	ListLimit         int            `json:"listLimit"`
	Settings          StreamSettings `json:"settings"`
	Subscriptions     []Subscription `json:"subscriptions"`
	SubscriptionLimit int            `json:"subscriptionLimit"`
	// Languages and Resolutions are the vocabularies the settings and the
	// subscription dialog choose from.
	Languages   []Language `json:"languages"`
	Resolutions []string   `json:"resolutions"`
	// A nil integration is one this deployment switched off.
	WebDAV       *Secret       `json:"webdav,omitempty"`
	S3           *S3           `json:"s3,omitempty"`
	API          *API          `json:"api,omitempty"`
	EmbedDomains []EmbedDomain `json:"embedDomains,omitempty"`
	Embed        bool          `json:"embed"`
	Password     *Password     `json:"password,omitempty"`
	Email        *Email        `json:"email,omitempty"`
	ShowAdult    bool          `json:"showAdult"`
}

type ProfileTier struct {
	Name string `json:"name"`
	// Rate is the speed cap in Mbps, nil when there is none.
	Rate *uint64 `json:"rate,omitempty"`
	Ads  bool    `json:"ads"`
}

// Billing is the "billed through <provider>" line on a paid plan.
type Billing struct {
	Provider       string `json:"provider"`
	ManageURL      string `json:"manageUrl"`
	CancelGuideURL string `json:"cancelGuideUrl,omitempty"`
}

type ProfileVault struct {
	// Available is nil when the plan's points are unlimited.
	Available *float64 `json:"available"`
	Vaulted   int      `json:"vaulted"`
}

// ProfileStremio is the addon: AddonURL is a path on the site's domain, ""
// before the account has minted its token.
type ProfileStremio struct {
	AddonURL string `json:"addonUrl"`
}

type Backend struct {
	ID        string     `json:"id"`
	Name      string     `json:"name"`
	Enabled   bool       `json:"enabled"`
	Status    string     `json:"status,omitempty"` // ok | invalid_credentials | rate_limited | error
	CheckedAt *time.Time `json:"checkedAt,omitempty"`
}

type BackendType struct {
	Type string `json:"type"`
	Name string `json:"name"`
}

type Addon struct {
	ID        string   `json:"id"`
	URL       string   `json:"url"`
	Name      string   `json:"name,omitempty"`
	Logo      string   `json:"logo,omitempty"`
	Resources []string `json:"resources"`
	Enabled   bool     `json:"enabled"`
}

type Indexer struct {
	ID      string `json:"id"`
	URL     string `json:"url"`
	Name    string `json:"name"`
	APIKey  bool   `json:"apiKey"`
	Movie   bool   `json:"movie"`
	Series  bool   `json:"series"`
	Enabled bool   `json:"enabled"`
}

type StreamSettings struct {
	Resolutions       []models.ResolutionSetting `json:"resolutions"`
	DiscoverOnly      bool                       `json:"discoverOnly"`
	PreferredLanguage string                     `json:"preferredLanguage"`
}

type Language struct {
	Code string `json:"code"`
	Name string `json:"name"`
	Flag string `json:"flag"`
}

type Subscription struct {
	ID     string `json:"id"`
	Title  string `json:"title"`
	Poster string `json:"poster"`
	Season int    `json:"season,omitempty"` // 0 for a movie
	// State is pending | active | completed.
	State       string     `json:"state"`
	Enabled     bool       `json:"enabled"`
	CheckedAt   *time.Time `json:"checkedAt,omitempty"`
	Resolutions []string   `json:"resolutions"`
	Language    string     `json:"language,omitempty"`
	// Wants is what the preferences dialog starts from: every resolution
	// when none is stored.
	Wants []string `json:"wants"`
}

// Secret is a credential URL (WebDAV); Value is "" until one is minted.
type Secret struct {
	Value string `json:"value"`
}

type S3 struct {
	Endpoint  string `json:"endpoint,omitempty"`
	AccessKey string `json:"accessKey,omitempty"`
	SecretKey string `json:"secretKey,omitempty"`
	Region    string `json:"region,omitempty"`
}

type API struct {
	Endpoint string          `json:"endpoint,omitempty"`
	Key      string          `json:"key,omitempty"`
	Docs     string          `json:"docs"`
	Devices  []ProfileDevice `json:"devices"`
}

type ProfileDevice struct {
	Name      string    `json:"name"`
	FullName  string    `json:"fullName"`
	CreatedAt time.Time `json:"createdAt"`
}

type EmbedDomain struct {
	ID     string `json:"id"`
	Domain string `json:"domain"`
}

type Password struct {
	Set          bool `json:"set"`
	ManagedByEnv bool `json:"managedByEnv"`
}

type Email struct {
	Current string `json:"current,omitempty"`
	Pending string `json:"pending,omitempty"`
}

func isPaid(cl *claims.Data) bool {
	// as web.Helper.IsPaid: no claims at all is a deployment without tiers
	return cl == nil || cl.Context == nil || cl.Context.Tier == nil || cl.Context.Tier.Id != 0
}

func (cfg *config) profile(ctx *web.Context) (any, error) {
	d, ok := ctx.Data.(*profile.Data)
	if !ok || d == nil {
		return nil, errNoData
	}
	out := &Profile{
		Tier:              ProfileTier{Name: "free"},
		Paid:              isPaid(ctx.Claims),
		ErrKey:            d.ErrKey,
		HasPayments:       d.HasPayments,
		Stremio:           ProfileStremio{AddonURL: d.StremioAddonURL},
		Backends:          []Backend{},
		BackendTypes:      []BackendType{},
		Addons:            []Addon{},
		Indexers:          []Indexer{},
		Subscriptions:     []Subscription{},
		SubscriptionLimit: d.SubscriptionLimit,
		Languages:         []Language{},
		Resolutions:       []string{},
		Embed:             !d.DisableEmbed,
		ShowAdult:         d.UserSettings != nil && d.UserSettings.ShowAdult,
	}
	if g := ctx.GetGinContext(); g != nil && d.ErrKey != "" {
		out.ErrFrom = g.Query("from")
	}
	if cl := ctx.Claims; cl != nil {
		if cl.Context != nil && cl.Context.Tier != nil {
			out.Tier.Name = cl.Context.Tier.Name
		}
		if cl.Claims != nil {
			if cl.Claims.Connection != nil {
				out.Tier.Rate = cl.Claims.Connection.Rate
			}
			out.Tier.Ads = cl.Claims.Site == nil || !cl.Claims.Site.NoAds
		}
	}
	if !out.Paid {
		out.ListLimit = freeListLimit
	}
	if b := d.Billing; b.ManageURL != "" && out.Tier.Name != "free" {
		out.Billing = &Billing{Provider: b.Provider, ManageURL: b.ManageURL, CancelGuideURL: b.CancelGuideURL}
	}
	if v := d.VaultStats; v != nil {
		out.Vault = &ProfileVault{Available: v.Available, Vaulted: v.VaultedCount}
	}

	names := map[string]string{}
	for _, bt := range d.AvailableBackendTypes {
		names[bt.Type] = bt.DisplayName
		out.BackendTypes = append(out.BackendTypes, BackendType{Type: bt.Type, Name: bt.DisplayName})
	}
	for _, b := range d.StreamingBackends {
		name := names[string(b.Type)]
		if name == "" {
			name = string(b.Type)
		}
		row := Backend{ID: b.ID.String(), Name: name, Enabled: b.Enabled, CheckedAt: b.LastCheckedAt}
		if b.LastStatus != nil {
			row.Status = string(*b.LastStatus)
		}
		out.Backends = append(out.Backends, row)
	}
	for _, a := range d.AddonUrls {
		row := Addon{ID: a.ID.String(), URL: a.Url, Resources: a.ManifestResources, Enabled: a.Enabled}
		if a.Name != nil {
			row.Name = *a.Name
		}
		if a.ManifestLogo != nil {
			row.Logo = *a.ManifestLogo
		}
		if row.Resources == nil {
			row.Resources = []string{}
		}
		out.Addons = append(out.Addons, row)
	}
	for i := range d.TorznabIndexers {
		ix := &d.TorznabIndexers[i]
		row := Indexer{ID: ix.ID.String(), URL: ix.Url, Name: ix.GetName(), APIKey: ix.ApiKey != nil && *ix.ApiKey != "", Enabled: ix.Enabled}
		if ix.Caps != nil {
			row.Movie = ix.Caps.SupportsMovieSearch()
			row.Series = ix.Caps.SupportsTVSearch()
		}
		out.Indexers = append(out.Indexers, row)
	}

	ss := d.StremioSettings
	if ss == nil {
		ss = models.GetDefaultStremioSettings()
	}
	out.Settings = StreamSettings{
		Resolutions:       ss.PreferredResolutions,
		DiscoverOnly:      ss.DiscoverOnly,
		PreferredLanguage: ss.PreferredLanguage,
	}
	for _, l := range stremio.Languages {
		out.Languages = append(out.Languages, Language{Code: l.Code, Name: l.Name, Flag: l.Flag})
	}
	for _, r := range models.GetDefaultStremioSettings().PreferredResolutions {
		out.Resolutions = append(out.Resolutions, r.Resolution)
	}

	for i := range d.Subscriptions {
		s := &d.Subscriptions[i]
		row := Subscription{
			ID:          s.ID.String(),
			Title:       s.GetTitle(),
			Poster:      "/lib/" + string(s.ContentType()) + "/poster/" + s.VideoID + "/160.jpg",
			Season:      s.GetSeason(),
			State:       "active",
			Enabled:     s.Enabled,
			CheckedAt:   s.LastCheckedAt,
			Resolutions: s.PreferredResolutions,
			Language:    s.GetPreferredLanguage(),
			Wants:       []string{},
		}
		switch {
		case s.IsCompleted():
			row.State = "completed"
		case s.State == models.ReleaseSubscriptionStatePendingBaseline:
			row.State = "pending"
		}
		if row.Resolutions == nil {
			row.Resolutions = []string{}
		}
		for _, r := range out.Resolutions {
			if s.WantsResolution(r) {
				row.Wants = append(row.Wants, r)
			}
		}
		out.Subscriptions = append(out.Subscriptions, row)
	}

	if !d.DisableWebDAV {
		out.WebDAV = &Secret{Value: d.WebDAVURL}
	}
	if !d.DisableS3 {
		out.S3 = &S3{}
		if c := d.S3; c != nil {
			*out.S3 = S3{Endpoint: c.Endpoint, AccessKey: c.AccessKey, SecretKey: c.SecretKey, Region: c.Region}
		}
	}
	if !d.DisableAPI {
		out.API = &API{Docs: d.APIDocsURL, Devices: []ProfileDevice{}}
		if c := d.API; c != nil {
			out.API.Endpoint, out.API.Key = c.Endpoint, c.Key
		}
		for _, dev := range d.Devices {
			out.API.Devices = append(out.API.Devices, ProfileDevice{Name: dev.Name, FullName: dev.FullName, CreatedAt: dev.CreatedAt})
		}
	}
	if out.Embed {
		out.EmbedDomains = []EmbedDomain{}
		for _, e := range d.EmbedDomains {
			out.EmbedDomains = append(out.EmbedDomains, EmbedDomain{ID: e.ID.String(), Domain: e.Domain})
		}
	}
	if d.IdentityEditable {
		out.Password = &Password{Set: d.PasswordSet, ManagedByEnv: d.PasswordManagedEnv}
	}
	if d.ShowEmailSection {
		out.Email = &Email{Current: d.NotificationEmail, Pending: d.PendingEmail}
	}
	return out, nil
}

// EmailVerified is the page a verification link lands on.
type EmailVerified struct {
	OK bool `json:"ok"`
}

func (cfg *config) emailVerified(ctx *web.Context) (any, error) {
	d, ok := ctx.Data.(*profile.EmailVerifiedData)
	if !ok || d == nil {
		return nil, errNoData
	}
	return &EmailVerified{OK: d.OK}, nil
}
