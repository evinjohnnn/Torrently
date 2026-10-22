package spa

import (
	"github.com/webtor-io/web-ui/handlers/speedtest"
	"github.com/webtor-io/web-ui/services/web"
)

func init() {
	page("speedtest/index", (*config).speedtest)
	page("speedtest/result", (*config).speedtestResult)
}

// Speedtest is /speedtest: the servers to measure against. The page
// measures in the browser and POSTs the speeds back to /speedtest.
type Speedtest struct {
	URLs []SpeedtestURL `json:"urls"`
	// AutoStart: the visitor pressed "Run again" (?again).
	AutoStart bool `json:"autoStart"`
}

type SpeedtestURL struct {
	URL  string `json:"url"`
	Type string `json:"type"`
}

func (cfg *config) speedtest(ctx *web.Context) (any, error) {
	d, ok := ctx.Data.(*speedtest.Data)
	if !ok {
		return nil, errNoData
	}
	out := &Speedtest{URLs: []SpeedtestURL{}, AutoStart: d.AutoStart}
	for _, u := range d.URLs {
		out.URLs = append(out.URLs, SpeedtestURL{URL: u.URL, Type: u.Type})
	}
	return out, nil
}

// SpeedtestResult is the measured speed (POST /speedtest) or a shared one
// (/speedtest/:id), with what it is enough for.
type SpeedtestResult struct {
	Speed        string             `json:"speed"`
	PremiumSpeed string             `json:"premiumSpeed"`
	HasPremium   bool               `json:"hasPremium"`
	SpeedBoost   string             `json:"speedBoost,omitempty"`
	RateLimit    uint64             `json:"rateLimit"`
	RateLimited  bool               `json:"rateLimited"`
	Quality      []SpeedtestQuality `json:"quality"`
	Plans        []SpeedtestPlan    `json:"plans"`
	ShareURL     string             `json:"shareUrl,omitempty"`
}

type SpeedtestQuality struct {
	Name     string  `json:"name"`
	MinSpeed float64 `json:"minSpeed"`
	Ok       bool    `json:"ok"`
}

type SpeedtestPlan struct {
	Name      string `json:"name"`
	Label     string `json:"label"`
	IsCurrent bool   `json:"isCurrent"`
	Supported bool   `json:"supported"`
}

func (cfg *config) speedtestResult(ctx *web.Context) (any, error) {
	d, ok := ctx.Data.(*speedtest.ResultData)
	if !ok {
		return nil, errNoData
	}
	out := &SpeedtestResult{
		Speed:        d.SpeedDisplay,
		PremiumSpeed: d.PremiumSpeedDisplay,
		HasPremium:   d.HasPremium,
		SpeedBoost:   d.SpeedBoost,
		RateLimit:    d.RateLimit,
		RateLimited:  d.RateLimited,
		ShareURL:     d.ShareURL,
		Quality:      []SpeedtestQuality{},
		Plans:        []SpeedtestPlan{},
	}
	for _, q := range d.Quality {
		out.Quality = append(out.Quality, SpeedtestQuality{Name: q.Name, MinSpeed: q.MinSpeed, Ok: q.Ok})
	}
	for _, p := range d.Plans {
		out.Plans = append(out.Plans, SpeedtestPlan{Name: p.Name, Label: p.Label, IsCurrent: p.IsCurrent, Supported: p.Supported})
	}
	return out, nil
}
