package core

import (
	"strings"
	"testing"
)

func TestExclusionsCoverEveryORBranch(t *testing.T) {
	for _, query := range []string{`Python OR Java`, `NAME:python OR NAME:java`, `(NAME:python) OR (NAME:java)`} {
		for _, mode := range []string{"roles", "stack"} {
			p, err := OptimizeWithExclusions(query, mode, "junior")
			want := "(" + query + `) AND NOT (NAME:"junior" OR DESCRIPTION:"junior")`
			if err != nil || p.Expression != want {
				t.Fatalf("query=%q mode=%s: got %q, err=%v; want %q", query, mode, p.Expression, err, want)
			}
			if got := ApplyExclusions(p.Expression, "junior"); got != want {
				t.Fatalf("confirmation duplicated exclusions: %s", got)
			}
		}
	}
}

func TestExclusionsPreserveOptimizationAndEmptyInput(t *testing.T) {
	for _, mode := range []string{"roles", "stack"} {
		base, err := Optimize("Python PostgreSQL", mode)
		if err != nil {
			t.Fatal(err)
		}
		p, err := OptimizeWithExclusions("Python PostgreSQL", mode, "junior")
		if err != nil || !strings.HasPrefix(p.Expression, "("+base.Expression+") AND NOT ") {
			t.Fatalf("optimization was lost: %+v, %v", p, err)
		}
		p, err = OptimizeWithExclusions("Python PostgreSQL", mode, " , ; \n\r\t \"\"")
		if err != nil || p.Expression != base.Expression {
			t.Fatalf("empty exclusions changed query: %+v, %v", p, err)
		}
	}
	for _, query := range []string{`Python OR Java`, `Python NOT junior`, `Python AND Java`} {
		p, err := Optimize(query, "roles")
		if err != nil || p.Expression != query {
			t.Fatalf("explicit HH syntax changed: %+v, %v", p, err)
		}
	}
}

func TestExclusionsNormalizePhrasesAndQuoteOperatorText(t *testing.T) {
	raw := "  Junior, junior; \"руководитель   проекта\"\nJUNIOR\r\n\"\", NAME:admin) OR (DESCRIPTION:all"
	p, err := OptimizeWithExclusions("Python", "roles", raw)
	want := `NOT (NAME:"Junior" OR DESCRIPTION:"Junior" OR NAME:"руководитель проекта" OR DESCRIPTION:"руководитель проекта" OR NAME:"NAME:admin) OR (DESCRIPTION:all" OR DESCRIPTION:"NAME:admin) OR (DESCRIPTION:all")`
	if err != nil || !strings.HasSuffix(p.Expression, want) {
		t.Fatalf("unsafe or unexpected clause: %s, %v", p.Expression, err)
	}
	if err := ValidateExpression(p.Expression); err != nil {
		t.Fatalf("operator text escaped its phrase: %v", err)
	}
}

func TestExclusionsDoNotSilentlyDropTerms(t *testing.T) {
	var words []string
	for _, letter := range "abcdefghijklmnopqrstu" {
		words = append(words, string(letter))
	}
	long := strings.Repeat("z", 90)
	words = append(words, long)
	p, err := OptimizeWithExclusions("Python", "roles", strings.Join(words, ","))
	if err != nil || !strings.Contains(p.Expression, `NAME:"u"`) || !strings.Contains(p.Expression, `NAME:"`+long+`"`) {
		t.Fatalf("exclusions were truncated: %s, %v", p.Expression, err)
	}
}

func TestExclusionsEnforceInputAndExpressionLimits(t *testing.T) {
	if _, err := OptimizeWithExclusions("Python", "roles", strings.Repeat("я,", 800)); err != nil {
		t.Fatalf("1600 Unicode characters should be accepted when deduplicated: %v", err)
	}
	for _, raw := range []string{strings.Repeat("x", 1601), strings.Repeat("я", 800)} {
		if _, err := OptimizeWithExclusions("Python", "roles", raw); err == nil {
			t.Fatal("oversized input or generated expression was accepted")
		}
	}
}

func TestApplyExclusionsDoesNotTrustAMatchingBranchOrSubstring(t *testing.T) {
	clause := `NOT (NAME:"junior" OR DESCRIPTION:"junior")`
	for _, expression := range []string{
		"python OR java AND " + clause,
		"(python) OR (java) AND " + clause,
		"(python) AND " + clause + " OR java",
		`NAME:"NOT (NAME:"junior" OR DESCRIPTION:"junior")"`,
	} {
		want := "(" + expression + ") AND " + clause
		if got := ApplyExclusions(expression, "junior"); got != want {
			t.Fatalf("branch or substring bypassed global exclusions: got %q want %q", got, want)
		}
	}
	prepared := `(NAME:(python OR "go developer")) AND ` + clause
	if got := ApplyExclusions(prepared, "junior"); got != prepared {
		t.Fatalf("parentheses in a quoted phrase broke idempotence: %s", got)
	}
}
