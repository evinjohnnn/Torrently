package spa

import (
	"github.com/hako/durafmt"

	"github.com/webtor-io/web-ui/handlers/instructions"
	"github.com/webtor-io/web-ui/services/web"
)

func init() {
	for _, name := range []string{"s3", "stremio", "stremio_addon", "torznab", "vault", "webdav"} {
		page("instructions/"+name, (*config).instructions)
	}
}

// Instructions is every /instructions/* guide; the view picks the guide,
// the copy is in the instructions.* strings.
type Instructions struct {
	S3Endpoint string `json:"s3Endpoint"`
	// Vault is set when the instance runs Vault: the guide then explains
	// its periods (the template's {{ with .Data.Vault }}).
	Vault *VaultPeriods `json:"vault,omitempty"`
}

// VaultPeriods are durations already written out the way the template's
// duration helper writes them ("1 week 3 days").
type VaultPeriods struct {
	Freeze          string `json:"freeze"`
	Expire          string `json:"expire"`
	TransferTimeout string `json:"transferTimeout"`
}

func (cfg *config) instructions(ctx *web.Context) (any, error) {
	d, ok := ctx.Data.(*instructions.Data)
	if !ok {
		return nil, errNoData
	}
	out := &Instructions{S3Endpoint: d.S3Endpoint}
	if v := d.Vault; v != nil {
		out.Vault = &VaultPeriods{
			Freeze:          durafmt.Parse(v.FreezePeriod).LimitFirstN(2).String(),
			Expire:          durafmt.Parse(v.ExpirePeriod).LimitFirstN(2).String(),
			TransferTimeout: durafmt.Parse(v.TransferTimeoutPeriod).LimitFirstN(2).String(),
		}
	}
	return out, nil
}
