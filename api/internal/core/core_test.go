package core

import (
	"strings"
	"testing"
)

func TestTechnologyBoundaries(t *testing.T) {
	cases := []struct {
		text, pattern string
		want          bool
	}{
		{"Django разработчик", "go", false}, {"Google Cloud", "go", false}, {"Go-разработчик", "go", true},
		{"JavaScript", "java", false}, {"C++ developer", `c\+\+`, true}, {"C# developer", `c\+\+`, false},
	}
	for _, c := range cases {
		if got := Contains(c.text, c.pattern); got != c.want {
			t.Errorf("Contains(%q,%q)=%v", c.text, c.pattern, got)
		}
	}
}
func TestOptimizationPreservesUserLogic(t *testing.T) {
	for _, mode := range []string{"roles", "stack"} {
		q := `NAME:(python OR golang) NOT junior`
		p, e := Optimize(q, mode)
		if e != nil || p.Expression != q {
			t.Fatalf("changed explicit expression: %+v %v", p, e)
		}
	}
	p, _ := Optimize("Python + PostgreSQL", "roles")
	if !strings.HasPrefix(p.Expression, "NAME:(python") || !strings.Contains(p.Expression, " AND (postgresql OR postgres)") {
		t.Fatal(p.Expression)
	}
	p, _ = Optimize("Golang", "roles")
	if !strings.Contains(p.Expression, `"go developer"`) {
		t.Fatal("missing role synonym")
	}
	p, _ = Optimize("Python", "stack")
	if strings.Contains(p.Expression, "NAME:") {
		t.Fatal("stack mode unexpectedly restricted title")
	}
}

func TestOptimizationAppliesSafeExclusionsOnce(t *testing.T) {
	p, err := OptimizeWithExclusions("Python", "roles", "стажёр, продажи")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(p.Expression, `NAME:"стажёр"`) || !strings.Contains(p.Expression, `DESCRIPTION:"продажи"`) {
		t.Fatalf("missing exclusions: %s", p.Expression)
	}
	if got := ApplyExclusions(p.Expression, "стажёр, продажи"); got != p.Expression {
		t.Fatalf("exclusions were duplicated: %s", got)
	}
}

func TestOptimizationAddsSafeTitleAndDescriptionExclusions(t *testing.T) {
	p, err := OptimizeWithExclusions("Python", "roles", "стажёр, руководитель проекта")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(p.Expression, `NOT (NAME:"стажёр" OR DESCRIPTION:"стажёр" OR NAME:"руководитель проекта" OR DESCRIPTION:"руководитель проекта")`) {
		t.Fatalf("missing exclusion clause: %s", p.Expression)
	}
	p, err = OptimizeWithExclusions(`NAME:(python OR golang)`, "roles", "junior")
	if err != nil || !strings.HasPrefix(p.Expression, `NAME:(python OR golang) AND NOT`) {
		t.Fatalf("explicit expression was not preserved: %+v %v", p, err)
	}
}

func TestOptimizationExpandsRoleSynonyms(t *testing.T) {
	p, err := Optimize("full stack developer", "roles")
	if err != nil || !strings.Contains(p.Expression, `"full stack"`) {
		t.Fatalf("role synonyms were not expanded: %+v %v", p, err)
	}
}
func TestRequirementsRespectSectionsAndNegation(t *testing.T) {
	description := "Обязанности\n\nМиграция с Java на Go\n\nТребования\n\nОпыт работы с PostgreSQL и Docker\n\nОпыт Java не требуется\n\nБудет плюсом\n\nKubernetes\n\nУсловия\n\nЗанятия английским"
	reqs := ExtractRequirements(description)
	got := map[string]string{}
	for _, r := range reqs {
		got[r.Label] = r.Kind
		if !strings.Contains(description, r.Quote) {
			t.Errorf("evidence missing from original: %q", r.Quote)
		}
	}
	if got["PostgreSQL"] != "Обязательно" || got["Docker"] != "Обязательно" || got["Kubernetes"] != "Будет плюсом" {
		t.Fatalf("wrong requirements: %+v", reqs)
	}
	for _, label := range []string{"Java", "Go", "Английский язык"} {
		if got[label] != "" {
			t.Errorf("incorrectly classified %s", label)
		}
	}
}
func TestReportDenominatorsAndSnapshots(t *testing.T) {
	zero := 0
	ten := 10
	vs := []Vacancy{
		{ID: "1", Loaded: true, Title: "Middle/Senior Go developer", Description: "Требования\n\nЗнание PostgreSQL", KeySkills: []string{"Golang", "Go", "Postgres"}, ResponseCount: &zero, WorkFormats: []string{"на месте работодателя, удалённо или гибрид"}, Experience: "1–3 года", Address: "Москва, Арбат"},
		{ID: "2", Loaded: true, Title: "Разработчик", ResponseCount: &ten, Experience: "3–6 лет"},
		{ID: "3", Loaded: true, Title: "Разработчик", Experience: "Более 6 лет"},
		{ID: "4", Loaded: false, Title: "Не загружена"},
	}
	for i := range vs {
		NormalizeVacancy(&vs[i])
	}
	r := BuildReport(vs)
	if r.Total != 3 || r.ResponseCoverage != 2 || r.ResponseMean == nil || *r.ResponseMean != 5 {
		t.Fatalf("bad denominator: %+v", r)
	}
	if vs[0].Grade != "Middle / Senior" || vs[1].Grade != "Не указан" || vs[0].Format != "Офис / Гибрид / Удалённо" {
		t.Fatalf("incorrect grouping: %+v", vs[0])
	}
	for _, m := range r.Skills {
		if m.Count != 1 || m.Percent != 33.3 {
			t.Errorf("skill duplicated or wrong percent: %+v", m)
		}
	}
	for key, dim := range r.Dimensions {
		if key == "format" {
			continue
		}
		sum := 0
		for _, m := range dim {
			sum += m.Count
		}
		if sum != 3 {
			t.Fatal("pie categories must be mutually exclusive")
		}
	}
}

func TestWorkFormatsOverlapWithoutDuplicatingVacancies(t *testing.T) {
	vs := []Vacancy{
		{ID: "1", Loaded: true, WorkFormats: []string{"на месте работодателя, удалённо или гибрид"}, Format: "Офис / Гибрид / Удалённо"},
		{ID: "2", Loaded: true, WorkFormats: []string{"удалённо"}},
		{ID: "3", Loaded: true, WorkFormats: []string{"разъездной"}},
	}
	r := BuildReport(vs)
	got := map[string]Metric{}
	for _, m := range r.Dimensions["format"] {
		got[m.Label] = m
	}
	if len(got) != 3 || got["Офис"].Count != 1 || got["Удалённо"].Count != 2 || got["Гибрид"].Count != 1 || got["Удалённо"].Percent != 66.7 {
		t.Fatalf("incorrect overlap: %+v", got)
	}
	if r.Total != 3 {
		t.Fatal("overlap changed the vacancy count")
	}
}

func TestEmploymentFormDimensions(t *testing.T) {
	vs := []Vacancy{
		{ID: "1", Loaded: true, Employment: "Оформление по ТК РФ"},
		{ID: "2", Loaded: true, Description: "Возможна работа по договору ГПХ или как самозанятый"},
		{ID: "3", Loaded: true, Description: "Условия обсуждаются"},
	}
	for i := range vs {
		NormalizeVacancy(&vs[i])
	}
	r := BuildReport(vs)
	got := map[string]Metric{}
	for _, m := range r.Dimensions["employmentForm"] {
		got[m.Label] = m
	}
	if got["ТК РФ"].Count != 1 || got["ГПХ"].Count != 1 || got["Самозанятость"].Count != 1 || got["Не указан"].Count != 1 {
		t.Fatalf("incorrect employment form stats: %+v", got)
	}
}
func TestValidateExpression(t *testing.T) {
	for _, s := range []string{`NAME:(go OR python`, `"python`, `python)`} {
		if ValidateExpression(s) == nil {
			t.Fatalf("accepted invalid expression: %s", s)
		}
	}
}

func TestRequirementsHeadingDoesNotMatchInsideWord(t *testing.T) {
	description := "О компании. Обязанности:\n\nРеализовать алгоритмы с жесткими требованиями к latency.\n\nИнтегрировать распределенные хранилища.\n\nТребования:\n\nПрофессиональные навыки:\n\nЗнание Rust.\n\nУсловия:\n\nОбучение Python."
	reqs := ExtractRequirements(description)
	if len(reqs) != 1 || reqs[0].Label != "Rust" {
		t.Fatalf("duties or section labels leaked into requirements: %+v", reqs)
	}
}

func TestAlternativeOptionalAndDutiesHeadings(t *testing.T) {
	description := "Наши ожидания:\n\nОпыт разработки на Rust\n\nБудет преимуществом:\n\nОпыт разработки на C++ и Swift\n\nВ работе вас ожидают:\n\nУчастие в разработке на Python\n\nЭтапы взаимодействия по вакансии:\n\nТестовое задание на Java"
	got := map[string]string{}
	for _, r := range ExtractRequirements(description) {
		got[r.Label] = r.Kind
	}
	if got["Rust"] != "Обязательно" || got["C++"] != "Будет плюсом" || got["Swift"] != "Будет плюсом" || got["Python"] != "" || got["Java"] != "" {
		t.Fatalf("incorrect section handling: %+v", got)
	}
}
