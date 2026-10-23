package spa

import (
	"github.com/webtor-io/web-ui/handlers/donate"
	"github.com/webtor-io/web-ui/services/web"
)

func init() { page("profile/payments", (*config).payments) }

// Payments is the crypto payment history (/profile/payments). A failed
// lookup comes as the page error with no rows.
type Payments struct {
	Rows []Payment `json:"rows"`
}

type Payment struct {
	Date       string `json:"date"` // RFC 3339, shown in the browser's zone
	Method     string `json:"method"`
	Tier       string `json:"tier"`
	PeriodDays int    `json:"periodDays"`
	AmountUSD  string `json:"amountUsd"`
	// Status is paid | pending | partial | failed | refunded.
	Status    string `json:"status"`
	PaymentID string `json:"paymentId"`
}

func (cfg *config) payments(ctx *web.Context) (any, error) {
	d, ok := ctx.Data.(*donate.PaymentsData)
	if !ok || d == nil {
		return nil, errNoData
	}
	out := &Payments{Rows: []Payment{}}
	for _, r := range d.Rows {
		out.Rows = append(out.Rows, Payment{
			Date:       r.DateISO,
			Method:     r.Method,
			Tier:       r.TierName,
			PeriodDays: r.PeriodDays,
			AmountUSD:  r.AmountUSD,
			Status:     r.StatusKey,
			PaymentID:  r.PaymentID,
		})
	}
	return out, nil
}
