package spa

import (
	"encoding/json"
	"reflect"

	"github.com/webtor-io/web-ui/services/job"
	"github.com/webtor-io/web-ui/services/offer"
	np "github.com/webtor-io/web-ui/services/payments"
	"github.com/webtor-io/web-ui/services/web"
)

func init() {
	page("donate/index", (*config).donate)
	page("donate/crypto_success", (*config).donateSuccess)
}

// Donate is /donate: the plans on sale as cards, Patreon and crypto.
// handlers/donate keeps its data types unexported; their fields are not,
// so the builder reads them through JSON (Cards) and reflection (the
// success page's job), without the handler changing.
type Donate struct {
	Cards          []DonateCard `json:"cards"`
	PatreonEnabled bool         `json:"patreonEnabled"`
	CryptoEnabled  bool         `json:"cryptoEnabled"`
	HasUnavailable bool         `json:"hasUnavailable"`
	AnnualSavePct  int          `json:"annualSavePct"`
	FreeMonths     int          `json:"freeMonths"`
	PatreonGiftURL string       `json:"patreonGiftUrl"`
	TrialDays      int          `json:"trialDays"`
	TrialTier      string       `json:"trialTier"`
}

type DonateCard struct {
	TierID      int             `json:"tierId"`
	Name        string          `json:"name"`
	TitleKey    string          `json:"titleKey"`
	TaglineKey  string          `json:"taglineKey"`
	Benefits    []DonateBenefit `json:"benefits"`
	Recommended bool            `json:"recommended"`
	TrialDays   int             `json:"trialDays"`
	// TrialURL starts the trial: /trial for the promo plan (offer.TrialURL),
	// the plan's own checkout otherwise. MonthURL follows it when the
	// monthly checkout is the trial.
	TrialURL           string `json:"trialUrl,omitempty"`
	HasMonthly         bool   `json:"hasMonthly"`
	MonthlyUSD         string `json:"monthlyUsd"`
	MonthlyUnavailable bool   `json:"monthlyUnavailable"`
	HasAnnual          bool   `json:"hasAnnual"`
	AnnualPerMonthUSD  string `json:"annualPerMonthUsd"`
	AnnualTotalUSD     string `json:"annualTotalUsd"`
	MonthURL           string `json:"monthUrl,omitempty"`
	YearURL            string `json:"yearUrl,omitempty"`
}

// DonateBenefit is an i18n key and the numbers it quotes.
type DonateBenefit struct {
	Key  string `json:"key"`
	Rate int64  `json:"rate"`
	VP   int64  `json:"vp"`
	TB   int64  `json:"tb"`
}

// donateIn is handlers/donate's donateData as JSON spells it.
type donateIn struct {
	Cards []struct {
		TierID             int
		Name               string
		TitleKey           string
		TaglineKey         string
		Benefits           []offer.Benefit
		Recommended        bool
		TrialDays          int
		TrialURL           string
		PromoTrial         bool
		HasMonthly         bool
		MonthlyUSD         string
		MonthlyUnavailable bool
		HasAnnual          bool
		AnnualPerMonthUSD  string
		AnnualTotalUSD     string
		PatreonMonthURL    string
		PatreonYearURL     string
	}
	PatreonEnabled bool
	CryptoEnabled  bool
	HasUnavailable bool
	AnnualSavePct  int
	FreeMonths     int
	PatreonGiftURL string
	TrialDays      int
	TrialTier      string
}

func (cfg *config) donate(ctx *web.Context) (any, error) {
	if ctx.Data == nil {
		return nil, errNoData
	}
	raw, err := json.Marshal(ctx.Data)
	if err != nil {
		return nil, err
	}
	var in donateIn
	if err := json.Unmarshal(raw, &in); err != nil {
		return nil, err
	}
	out := &Donate{
		Cards:          []DonateCard{},
		PatreonEnabled: in.PatreonEnabled,
		CryptoEnabled:  in.CryptoEnabled,
		HasUnavailable: in.HasUnavailable,
		AnnualSavePct:  in.AnnualSavePct,
		FreeMonths:     in.FreeMonths,
		PatreonGiftURL: in.PatreonGiftURL,
		TrialDays:      in.TrialDays,
		TrialTier:      in.TrialTier,
	}
	// the promo plan's trial starts through /trial, like every other button
	// that starts it (docs/offers.md, the template's trialURL)
	var promoTrial string
	if cfg.offers != nil {
		promoTrial, _ = offer.TrialURL(ctx.Lang, "donate", cfg.offers.Promo())
	}
	for _, c := range in.Cards {
		card := DonateCard{
			TierID:             c.TierID,
			Name:               c.Name,
			TitleKey:           c.TitleKey,
			TaglineKey:         c.TaglineKey,
			Benefits:           []DonateBenefit{},
			Recommended:        c.Recommended,
			TrialDays:          c.TrialDays,
			TrialURL:           c.TrialURL,
			HasMonthly:         c.HasMonthly,
			MonthlyUSD:         c.MonthlyUSD,
			MonthlyUnavailable: c.MonthlyUnavailable,
			HasAnnual:          c.HasAnnual,
			AnnualPerMonthUSD:  c.AnnualPerMonthUSD,
			AnnualTotalUSD:     c.AnnualTotalUSD,
			MonthURL:           c.PatreonMonthURL,
			YearURL:            c.PatreonYearURL,
		}
		if c.PromoTrial && promoTrial != "" {
			card.TrialURL, card.MonthURL = promoTrial, promoTrial
		}
		for _, b := range c.Benefits {
			card.Benefits = append(card.Benefits, DonateBenefit{Key: b.Key, Rate: b.Rate, VP: b.VP, TB: b.TB})
		}
		out.Cards = append(out.Cards, card)
	}
	return out, nil
}

// DonateSuccess is where the crypto checkout returns
// (/donate/crypto/success): the payment's state, and while it is pending,
// the job that watches it and redirects back here once it settles.
type DonateSuccess struct {
	// State is done, pending, partial or failed; empty with the page error.
	State      string `json:"state"`
	InvoiceURL string `json:"invoiceUrl,omitempty"`
	JobLogURL  string `json:"jobLogUrl,omitempty"`
}

func (cfg *config) donateSuccess(ctx *web.Context) (any, error) {
	v := reflect.ValueOf(ctx.Data)
	if v.Kind() == reflect.Pointer {
		v = v.Elem()
	}
	if v.Kind() != reflect.Struct {
		return nil, errNoData
	}
	flag := func(name string) bool {
		f := v.FieldByName(name)
		return f.IsValid() && f.Kind() == reflect.Bool && f.Bool()
	}
	out := &DonateSuccess{}
	switch {
	case flag("Done"):
		out.State = "done"
	case flag("Pending"):
		out.State = "pending"
	case flag("Partial"):
		out.State = "partial"
	case ctx.ErrKey == "":
		out.State = "failed"
	}
	field := func(name string) any {
		if f := v.FieldByName(name); f.IsValid() && f.CanInterface() {
			return f.Interface()
		}
		return nil
	}
	if p, ok := field("Payment").(*np.Payment); ok && p != nil {
		out.InvoiceURL = p.InvoiceURL
	}
	if j, ok := field("Job").(*job.Job); ok && j != nil {
		out.JobLogURL = web.LangURL(ctx.Lang, "/queue/"+j.Queue+"/job/"+j.ID+"/log")
	}
	return out, nil
}
