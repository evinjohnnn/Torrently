package spa

import (
	"net/url"

	"github.com/webtor-io/web-ui/handlers/vault"
	"github.com/webtor-io/web-ui/services/web"
)

func init() { page("vault/index", (*config).vault) }

// VaultPage is the Vault dashboard ("vault/index"): the balance, what it
// holds, and every pledge with its state.
type VaultPage struct {
	Stats   *VaultStats `json:"stats,omitempty"`
	Pledges []Pledge    `json:"pledges"`
	// IsFree: no paid plan, so an empty Vault offers one instead.
	IsFree bool `json:"isFree"`
}

// VaultStats are the two summaries. Total and Available are null for an
// unlimited balance.
type VaultStats struct {
	Vaulted   int      `json:"vaulted"`
	Loading   int      `json:"loading"`
	Expiring  int      `json:"expiring"`
	Total     *float64 `json:"total"`
	Available *float64 `json:"available"`
	Funded    float64  `json:"funded"`
	Frozen    float64  `json:"frozen"`
}

// Pledge is one row. A funded pledge on a torrent still being vaulted
// carries the status stream its row follows (GET /:id/status without
// session=1: the state, its progress and the badge).
type Pledge struct {
	ResourceID string  `json:"resourceId"`
	Name       string  `json:"name"`
	Amount     float64 `json:"amount"`
	Frozen     bool    `json:"frozen"`
	Funded     bool    `json:"funded"`
	Vaulted    bool    `json:"vaulted"`
	// ExpiresIn is the seconds left before an unfunded torrent is removed.
	ExpiresIn int64  `json:"expiresIn,omitempty"`
	StreamURL string `json:"streamUrl,omitempty"`
}

func (cfg *config) vault(ctx *web.Context) (any, error) {
	d, ok := ctx.Data.(*vault.PledgeListData)
	if !ok || d == nil {
		return nil, errNoData
	}
	out := &VaultPage{Pledges: []Pledge{}, IsFree: d.IsFree}
	if s := d.Stats; s != nil {
		out.Stats = &VaultStats{
			Vaulted: s.VaultedCount, Loading: s.LoadingCount, Expiring: s.ExpiringCount,
			Total: s.Total, Available: s.Available, Funded: s.Funded, Frozen: s.Frozen,
		}
	}
	for _, p := range d.Pledges {
		// the template skips a pledge whose torrent is gone
		if p.Resource == nil {
			continue
		}
		row := Pledge{
			ResourceID: p.ResourceID,
			Name:       p.Resource.Name,
			Amount:     p.Amount,
			Frozen:     p.IsFrozen,
			Funded:     p.Funded,
			Vaulted:    p.Resource.Vaulted,
			ExpiresIn:  int64(p.ExpiresIn.Seconds()),
		}
		if p.ShowProgress {
			q := url.Values{}
			q.Set("_csrf", ctx.CSRF)
			if tok := cfg.resource.StatusToken(p.ResourceID); tok != "" {
				q.Set("token", tok)
			}
			row.StreamURL = web.LangURL(ctx.Lang, "/"+p.ResourceID+"/status") + "?" + q.Encode()
		}
		out.Pledges = append(out.Pledges, row)
	}
	return out, nil
}
