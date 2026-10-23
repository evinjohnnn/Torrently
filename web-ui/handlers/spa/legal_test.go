package spa

import (
	"os"
	"strings"
	"testing"
)

// The React legal pages render the template's "legal_body" block (and
// "legal_updated" where the page is dated): a legal view without them would
// fall back to the classic page.
func TestLegalViewsDefineTheirText(t *testing.T) {
	for view := range pageBuilders {
		if !strings.HasPrefix(view, "legal/") {
			continue
		}
		raw, err := os.ReadFile("../../templates/views/" + view + ".html")
		if err != nil {
			t.Fatal(err)
		}
		text := string(raw)
		if !strings.Contains(text, `{{ define "legal_body" }}`) {
			t.Errorf("%s: no legal_body block", view)
		}
		if strings.Contains(text, "Last updated") && !strings.Contains(text, `{{ define "legal_updated" }}Last updated`) {
			t.Errorf("%s: the date is outside legal_updated", view)
		}
	}
}
