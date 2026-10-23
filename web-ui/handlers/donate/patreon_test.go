package donate

// The tests run with a Patreon page configured, as a deployment that sells
// through Patreon would (PATREON_CAMPAIGN, PATREON_TIER_IDS).
func init() {
	patreon = patreonConfig{
		campaign: "example",
		rids:     map[string]string{"bronze": "3981231", "silver": "3972747", "gold": "3981014"},
	}
}
