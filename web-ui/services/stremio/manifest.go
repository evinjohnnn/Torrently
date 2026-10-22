package stremio

import (
	"context"
	"fmt"

	"github.com/urfave/cli"
	"github.com/webtor-io/web-ui/services/auth"
)

const catalogID = "Torrently"

const (
	addonIDFlag         = "stremio-addon-id"
	contactEmailFlag    = "stremio-contact-email"
	addonsSignatureFlag = "stremio-addons-signature"
)

// identity is who the addon says it is. Stremio tells addons apart by id, so
// a deployment must not reuse another operator's id, and the
// stremio-addons.net signature is issued to one addon only.
var identity = struct {
	id, contactEmail, signature string
}{id: "org.stremio.torrently"}

// RegisterFlags adds the addon's identity settings.
func RegisterFlags(f []cli.Flag) []cli.Flag {
	return append(f,
		cli.StringFlag{
			Name:   addonIDFlag,
			Usage:  "Stremio addon id, unique to this deployment",
			Value:  identity.id,
			EnvVar: "STREMIO_ADDON_ID",
		},
		cli.StringFlag{
			Name:   contactEmailFlag,
			Usage:  "contact address in the Stremio addon manifest",
			EnvVar: "STREMIO_CONTACT_EMAIL",
		},
		cli.StringFlag{
			Name:   addonsSignatureFlag,
			Usage:  "stremio-addons.net signature issued to this addon",
			EnvVar: "STREMIO_ADDONS_SIGNATURE",
		},
	)
}

// Configure reads the identity settings; call it once at start-up.
func Configure(c *cli.Context) {
	if id := c.String(addonIDFlag); id != "" {
		identity.id = id
	}
	identity.contactEmail = c.String(contactEmailFlag)
	identity.signature = c.String(addonsSignatureFlag)
}

// manifestVersion goes up whenever what the manifest says changes: Stremio
// keeps the manifest it installed, and a new version is what makes clients
// and addon catalogues pick up the new text.
const manifestVersion = "0.1.0"

// manifestDescription says what the addon is without promising speed: how
// fast a stream starts depends on the swarm. It quotes no free-plan cap
// either: the site's free cap does not apply here, because streams the
// addon plays through Webtor's servers need a paid plan (a user's own
// streaming backend is tried first — see services/link_resolver). "Paid"
// is spelled out: Free is a plan too, in Webtor's own words (/donate,
// llms.txt), and "needs a Webtor plan" read as "an account will do".
const manifestDescription = "Your Torrently library in Stremio, plus the Stremio addons you add to your Torrently profile, played through Torrently. " +
	"Torrents download on Torrently's servers, not on your device, so your IP address never joins the swarm. " +
	"Playing through Torrently's servers needs a paid Torrently plan."

type Manifest struct {
	domain string
	u      *auth.User
	ht     bool
}

func NewManifest(domain string, u *auth.User, hasToken bool) *Manifest {
	return &Manifest{
		domain: domain,
		u:      u,
		ht:     hasToken,
	}
}

func (s *Manifest) GetManifest(c context.Context) (*ManifestResponse, error) {
	m := &ManifestResponse{
		Id:          identity.id,
		Version:     manifestVersion,
		Name:        "Torrently",
		Description: manifestDescription,
		Types:       []string{"movie", "series"},
		Catalogs: []CatalogItem{
			{"movie", catalogID},
			{"series", catalogID},
		},
		Resources:    []string{"stream", "catalog", "meta"},
		Logo:         fmt.Sprintf("%v/assets/night/android-chrome-256x256.png", s.domain),
		ContactEmail: identity.contactEmail,
	}
	if identity.signature != "" {
		m.AddonsConfig = &AddonsConfig{Issuer: "https://stremio-addons.net", Signature: identity.signature}
	}
	if s.u == nil || !s.ht {
		m.BehaviorHints = &BehaviorHints{
			Configurable:          true,
			ConfigurationRequired: true,
		}

	}
	return m, nil
}

var _ ManifestService = (*Manifest)(nil)
