package core

import (
	"reflect"
	"testing"
)

func TestGradeLabels(t *testing.T) {
	for _, tc := range []struct {
		value string
		want  []string
	}{
		{"Middle/Senior", []string{"Middle", "Senior"}},
		{" junior / Middle / senior / Lead ", []string{"Junior", "Middle", "Senior", "Lead"}},
		{"middle / Middle / SENIOR / senior /", []string{"Middle", "Senior"}},
		{"", []string{"Не указан"}},
		{" / / ", []string{"Не указан"}},
		{"не указан", []string{"Не указан"}},
		{"Staff / Principal", []string{"Staff", "Principal"}},
	} {
		t.Run(tc.value, func(t *testing.T) {
			if got := GradeLabels(tc.value); !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("GradeLabels(%q) = %v, want %v", tc.value, got, tc.want)
			}
		})
	}
}

func TestBuildReportOverlappingGrades(t *testing.T) {
	zero, ten, twenty := 0, 10, 20
	vacancies := []Vacancy{
		{ID: "both", Grade: "middle/Senior / Middle", ResponseCount: &zero, Loaded: true},
		{ID: "senior", Grade: "Senior", ResponseCount: &ten, Loaded: true},
		{ID: "triple", Grade: "Junior/Middle/Lead", ResponseCount: &twenty, Loaded: true},
		{ID: "unknown", Grade: " / ", Loaded: true},
		{ID: "unloaded", Grade: "Junior/Senior", ResponseCount: &twenty},
	}
	r := BuildReport(vacancies)
	if r.Total != 4 || r.ResponseCoverage != 3 || r.ResponseMean == nil || *r.ResponseMean != 10 || len(r.Responses) != 3 {
		t.Fatalf("vacancy totals were multiplied by grade memberships: %+v", r)
	}
	want := map[string][]string{"Junior": {"triple"}, "Middle": {"both", "triple"}, "Senior": {"both", "senior"}, "Lead": {"triple"}, "Не указан": {"unknown"}}
	if len(r.Dimensions["grade"]) != len(want) {
		t.Fatalf("unexpected grade dimensions: %+v", r.Dimensions["grade"])
	}
	for _, metric := range r.Dimensions["grade"] {
		ids, ok := want[metric.Label]
		if !ok || !reflect.DeepEqual(metric.VacancyIDs, ids) || metric.Count != len(ids) || metric.Percent != float64(len(ids))*25 {
			t.Fatalf("unexpected grade metric: %+v", metric)
		}
		if len(metric.Evidence) != len(ids) {
			t.Fatalf("evidence duplicated or missing: %+v", metric)
		}
		for i, evidence := range metric.Evidence {
			if evidence.VacancyID != ids[i] || evidence.Field != "grade" || evidence.Quote != metric.Label {
				t.Fatalf("wrong source for individual grade: %+v", evidence)
			}
		}
	}
	if vacancies[0].Grade != "middle/Senior / Middle" {
		t.Fatal("source grade was mutated")
	}
	if r.Version != "rules-v6" {
		t.Fatalf("report migration version missing: %q", r.Version)
	}
}
