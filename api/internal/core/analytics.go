package core

import (
	"math"
	"regexp"
	"sort"
	"strings"
)

func NormalizeVacancy(v *Vacancy) {
	if v.City == "" {
		v.City = strings.TrimSpace(strings.Split(v.Address, ",")[0])
	}
	if v.City == "" {
		v.City = "Не указан"
	}
	text := strings.Join(v.WorkFormats, " ")
	var formats []string
	for _, f := range []struct{ p, l string }{{`на месте|офис|on.?site`, "Офис"}, {`гибрид|hybrid`, "Гибрид"}, {`удал|remote`, "Удалённо"}, {`разъезд|field`, "Разъездной"}} {
		if regexp.MustCompile("(?i)" + f.p).MatchString(text) {
			formats = append(formats, f.l)
		}
	}
	v.Format = strings.Join(formats, " / ")
	if v.Format == "" {
		v.Format = "Не указан"
	}
	forms := EmploymentForms(*v)
	v.EmploymentForm = strings.Join(forms, " / ")
	var grades []string
	for _, g := range []struct{ p, l string }{{`junior|jun|джуниор|младший`, "Junior"}, {`middle|mid|мидл`, "Middle"}, {`senior|sr|сеньор|синьор`, "Senior"}, {`lead|тимлид|techlead`, "Lead"}} {
		if Contains(v.Title, g.p) {
			grades = append(grades, g.l)
		}
	}
	// Only explicit self-contained grade declarations from the description, not mentions of colleagues.
	if len(grades) == 0 {
		for _, p := range strings.Split(v.Description, "\n\n") {
			if regexp.MustCompile(`(?i)^(грейд|уровень позиции|grade|seniority)\s*:`).MatchString(p) {
				for _, g := range []struct{ p, l string }{{`junior|jun`, "Junior"}, {`middle|mid`, "Middle"}, {`senior|sr`, "Senior"}, {`lead`, "Lead"}} {
					if Contains(p, g.p) {
						grades = append(grades, g.l)
					}
				}
			}
		}
	}
	v.Grade = strings.Join(grades, " / ")
	if v.Grade == "" {
		v.Grade = "Не указан"
	}
	if v.Experience == "" {
		v.Experience = "Не указан"
	}
	v.Requirements = ExtractRequirements(v.Description)
}

// EmploymentForms returns the legal engagement forms explicitly mentioned in a
// vacancy. A missing mention is kept as a separate category so the report
// denominator remains visible to the reader.
func EmploymentForms(v Vacancy) []string {
	text := strings.ToLower(strings.Join([]string{v.EmploymentForm, v.Employment, v.Description}, " "))
	result := []string{}
	add := func(label string) {
		for _, existing := range result {
			if existing == label {
				return
			}
		}
		result = append(result, label)
	}
	if regexp.MustCompile(`(?i)(?:^|[^\p{L}\p{N}_])тк\s*рф(?:$|[^\p{L}\p{N}_])|(?:^|[^\p{L}])(?:трудов\p{L}*\s+договор|официальн\p{L}*\s+оформ)`).MatchString(text) {
		add("ТК РФ")
	}
	if regexp.MustCompile(`(?i)(?:^|[^\p{L}\p{N}_])гпх(?:$|[^\p{L}\p{N}_])|(?:^|[^\p{L}])(?:гражданск\p{L}*[- ]правов\p{L}*\s+договор|договор\p{L}*\s+подряда|оказани\p{L}*\s+услуг)`).MatchString(text) {
		add("ГПХ")
	}
	if regexp.MustCompile(`(?i)самозанят\p{L}*`).MatchString(text) {
		add("Самозанятость")
	}
	if regexp.MustCompile(`(?i)(?:^|[^\p{L}\p{N}_])ип(?:$|[^\p{L}\p{N}_])|индивидуальн\p{L}* предпринимател\p{L}*`).MatchString(text) {
		add("ИП")
	}
	if len(result) == 0 {
		return []string{"Не указан"}
	}
	return result
}

type rule struct{ key, label, pattern string }

var requirementRules = []rule{
	{"rest", "REST API", `rest(?:ful)?|rest api`},
	{"microservices", "Микросервисная архитектура", `микросервис|microservices?`},
	{"distributed", "Распределённые системы", `распредел[её]нн\p{L}* систем|distributed systems`},
	{"algorithms", "Алгоритмы и структуры данных", `алгоритм|структур\p{L}* данных|data structures`},
	{"tests", "Автоматизированное тестирование", `unit.?тест|юнит.?тест|модульн\p{L}* тест|unit test|автотест|автоматиз\p{L}* тест`},
	{"english", "Английский язык", `английск|english`},
	{"teamwork", "Работа в команде", `работ\p{L}* в команде|teamwork|team player`},
	{"communication", "Коммуникация", `коммуника|communication`},
	{"ci", "CI/CD", `ci/cd|ci cd|continuous integration|непрерывн\p{L}* интеграц`},
	{"highload", "Высоконагруженные системы", `высоконагруж|high.?load`},
	{"oop", "ООП и принципы проектирования", `ооп|solid|design patterns|паттерн\p{L}* проектир`},
	{"concurrency", "Многопоточность и конкурентность", `многопоточ|конкурентн|concurrency|goroutines?`},
	{"databases", "Работа с базами данных", `баз\p{L}* данных|databases?`},
	{"degree", "Профильное образование", `высшее|техническое образование|bachelor|computer science`},
}

func ExtractRequirements(description string) []Requirement {
	// Some sources flatten paragraphs. Restore only unambiguous section headings.
	requiredHeaders := `требования|требования к кандидату|наши ожидания|мы ожидаем от вас|ожидаем от вас|что мы ожидаем|что нужно знать|что важно для нас|что мы жд[её]м|requirements|ожидания|мы жд[её]м`
	optionalHeaders := `будет плюсом|будет преимуществом|преимуществом будет|плюсом будет|желательно|приветствуется|nice to have|preferred|preferred skills`
	otherHeaders := `обязанности|ваши задачи|твои задачи|чем предстоит заниматься|что предстоит делать|в работе вас ожидают|задачи|условия|условия работы|мы предлагаем|что мы предлагаем|этапы взаимодействия по вакансии|этапы отбора|процесс найма|responsibilities|benefits`
	headingRE := regexp.MustCompile(`(?im)(^|\n|[.!?] +)(` + requiredHeaders + `|` + optionalHeaders + `|` + otherHeaders + `)(\s*:\s*|\s*(\n|$))`)
	description = headingRE.ReplaceAllString(description, "\n\n$2\n\n")
	parts := regexp.MustCompile(`\n\s*\n|[;•]`).Split(description, -1)
	section := ""
	seen := map[string]bool{}
	out := []Requirement{}
	for _, raw := range parts {
		p := strings.TrimSpace(raw)
		if len([]rune(p)) < 3 {
			continue
		}
		l := strings.ToLower(p)
		if len([]rune(p)) < 70 {
			if regexp.MustCompile(`(?i)^(` + requiredHeaders + `)\s*:?$`).MatchString(p) {
				section = "required"
				continue
			}
			if regexp.MustCompile(`(?i)^(` + optionalHeaders + `)\s*:?$`).MatchString(p) {
				section = "optional"
				continue
			}
			if regexp.MustCompile(`(?i)^(` + otherHeaders + `)\s*:?$`).MatchString(p) {
				section = "other"
				continue
			}
		}
		if section == "other" {
			continue
		}
		if len([]rune(p)) < 100 && strings.HasSuffix(p, ":") {
			continue
		}
		if section == "" && !regexp.MustCompile(`(?i)опыт|знани|умени|понимани|владени|понимаете|умеете|знаете|experience|proficien|knowledge|required`).MatchString(p) {
			continue
		}
		if regexp.MustCompile(`(?i)не требу|не обязател|без опыта|не нужен|не нужно|not required|no experience`).MatchString(p) {
			continue
		}
		kind := "Обязательно"
		if section == "optional" || regexp.MustCompile(`(?i)преимуществ|плюсом|желатель|nice to have|preferred|bonus`).MatchString(l) {
			kind = "Будет плюсом"
		}
		add := func(key, label string) {
			k := key + "|" + kind
			if !seen[k] {
				seen[k] = true
				out = append(out, Requirement{k, label, kind, p})
			}
		}
		matched := false
		for _, t := range Technologies {
			if Contains(p, t.Pattern) {
				add("tech:"+t.Name, t.Name)
				matched = true
			}
		}
		for _, r := range requirementRules {
			if regexp.MustCompile("(?i)" + r.pattern).MatchString(p) {
				add(r.key, r.label)
				matched = true
			}
		}
		if !matched {
			text := strings.Join(strings.Fields(p), " ")
			// Keep unmapped requirements verbatim: no invented semantic generalisation.
			if len([]rune(text)) >= 8 && len([]rune(text)) <= 220 {
				add("literal:"+strings.ToLower(text), text)
			}
		}
	}
	return out
}

func canonicalSkill(s string) string {
	l := strings.ToLower(strings.TrimSpace(s))
	for _, t := range Technologies {
		for _, a := range t.Aliases {
			if l == a {
				return t.Name
			}
		}
	}
	return strings.TrimSpace(s)
}

func WorkFormats(v Vacancy) []string {
	text := strings.Join(v.WorkFormats, " ") + " " + v.Format
	result := []string{}
	for _, f := range []struct{ pattern, label string }{{`на месте|офис|on.?site`, "Офис"}, {`удал|remote`, "Удалённо"}, {`гибрид|hybrid`, "Гибрид"}} {
		if regexp.MustCompile("(?i)" + f.pattern).MatchString(text) {
			result = append(result, f.label)
		}
	}
	return result
}

func BuildReport(vacancies []Vacancy) *Report {
	r := &Report{Dimensions: map[string][]Metric{}, Skills: []Metric{}, Requirements: []Metric{}, Responses: []ResponsePoint{}, Version: "rules-v5"}
	groups := map[string]map[string]*Metric{}
	for _, dim := range []string{"city", "format", "employmentForm", "experience", "grade"} {
		groups[dim] = map[string]*Metric{}
	}
	for _, label := range []string{"Офис", "Удалённо", "Гибрид"} {
		groups["format"][label] = &Metric{Key: label, Label: label, VacancyIDs: []string{}, Evidence: []Evidence{}}
	}
	for _, label := range []string{"ТК РФ", "ИП", "Самозанятость", "ГПХ", "Не указан"} {
		groups["employmentForm"][label] = &Metric{Key: label, Label: label, VacancyIDs: []string{}, Evidence: []Evidence{}}
	}
	skills := map[string]*Metric{}
	reqs := map[string]*Metric{}
	add := func(m map[string]*Metric, key, label, kind string, v Vacancy, field, quote string) {
		if m[key] == nil {
			m[key] = &Metric{Key: key, Label: label, Kind: kind, VacancyIDs: []string{}, Evidence: []Evidence{}}
		}
		x := m[key]
		for _, id := range x.VacancyIDs {
			if id == v.ID {
				return
			}
		}
		x.Count++
		x.VacancyIDs = append(x.VacancyIDs, v.ID)
		x.Evidence = append(x.Evidence, Evidence{v.ID, field, quote})
	}
	sum := 0
	for _, v := range vacancies {
		if !v.Loaded {
			continue
		}
		r.Total++
		for _, d := range []struct{ key, value, field string }{{"city", v.City, "city"}, {"experience", v.Experience, "experience"}, {"grade", v.Grade, "grade"}} {
			add(groups[d.key], d.value, d.value, "", v, d.field, d.value)
		}
		for _, label := range WorkFormats(v) {
			add(groups["format"], label, label, "", v, "workFormats", label)
		}
		for _, label := range EmploymentForms(v) {
			add(groups["employmentForm"], label, label, "", v, "employmentForm", label)
		}
		if len(v.KeySkills) > 0 {
			r.SkillsCoverage++
		}
		for _, s := range v.KeySkills {
			name := canonicalSkill(s)
			if name != "" {
				add(skills, strings.ToLower(name), name, "", v, "keySkills", s)
			}
		}
		if len(v.Requirements) > 0 {
			r.RequirementsCoverage++
		}
		for _, q := range v.Requirements {
			add(reqs, q.Key+"|"+q.Kind, q.Label, q.Kind, v, "description", q.Quote)
		}
		if v.ResponseCount != nil {
			r.ResponseCoverage++
			sum += *v.ResponseCount
			r.Responses = append(r.Responses, ResponsePoint{v.ID, v.Title, *v.ResponseCount})
		}
	}
	if r.ResponseCoverage > 0 {
		m := float64(sum) / float64(r.ResponseCoverage)
		r.ResponseMean = &m
	}
	finish := func(m map[string]*Metric) []Metric {
		out := []Metric{}
		for _, v := range m {
			if r.Total > 0 {
				v.Percent = math.Round(float64(v.Count)*1000/float64(r.Total)) / 10
			}
			out = append(out, *v)
		}
		sort.Slice(out, func(i, j int) bool {
			if out[i].Count == out[j].Count {
				return out[i].Label < out[j].Label
			}
			return out[i].Count > out[j].Count
		})
		return out
	}
	for key, m := range groups {
		r.Dimensions[key] = finish(m)
	}
	r.Skills = finish(skills)
	r.Requirements = finish(reqs)
	sort.Slice(r.Responses, func(i, j int) bool { return r.Responses[i].Count > r.Responses[j].Count })
	return r
}
