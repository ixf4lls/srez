package core

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
)

type Technology struct {
	Name    string
	Aliases []string
	Pattern string
}

var Technologies = []Technology{
	{"Go", []string{"golang", "go"}, `golang|go`},
	{"C++", []string{"c++", "cpp", "cplusplus"}, `c\+\+|cpp|cplusplus`},
	{"C#", []string{"c#", "csharp", "c sharp"}, `c#|csharp|c sharp`},
	{"Python", []string{"python", "питон"}, `python|питон`},
	{"JavaScript", []string{"javascript", "js"}, `javascript|js`},
	{"TypeScript", []string{"typescript", "ts"}, `typescript|ts`},
	{"Java", []string{"java"}, `java`},
	{"Kotlin", []string{"kotlin"}, `kotlin`},
	{"PHP", []string{"php"}, `php`},
	{"Rust", []string{"rust"}, `rust`},
	{"Swift", []string{"swift"}, `swift`},
	{"Ruby", []string{"ruby", "rails"}, `ruby|rails`},
	{"React", []string{"react", "reactjs", "react.js"}, `react(?:\.js|js)?`},
	{"Vue", []string{"vue", "vuejs", "vue.js"}, `vue(?:\.js|js)?`},
	{"Angular", []string{"angular", "angularjs"}, `angular(?:js)?`},
	{"Node.js", []string{"node.js", "nodejs", "node js"}, `node(?:\.js|js| js)`},
	{".NET", []string{".net", "dotnet"}, `\.net|dotnet`},
	{"PostgreSQL", []string{"postgresql", "postgres"}, `postgres(?:ql)?`},
	{"MySQL", []string{"mysql"}, `mysql`},
	{"SQL", []string{"sql"}, `sql`},
	{"Redis", []string{"redis"}, `redis`},
	{"MongoDB", []string{"mongodb", "mongo"}, `mongodb|mongo`},
	{"Docker", []string{"docker", "докер"}, `docker|докер`},
	{"Kubernetes", []string{"kubernetes", "k8s"}, `kubernetes|k8s`},
	{"Kafka", []string{"kafka", "apache kafka"}, `kafka`},
	{"RabbitMQ", []string{"rabbitmq"}, `rabbitmq`},
	{"Linux", []string{"linux", "линукс"}, `linux|линукс`},
	{"Git", []string{"git"}, `git`},
	{"FastAPI", []string{"fastapi", "fast api"}, `fastapi|fast api`},
	{"Django", []string{"django"}, `django`},
	{"Flask", []string{"flask"}, `flask`},
	{"Spring", []string{"spring", "spring boot"}, `spring`},
	{"PyTorch", []string{"pytorch"}, `pytorch`},
	{"TensorFlow", []string{"tensorflow"}, `tensorflow`},
	{"Pandas", []string{"pandas"}, `pandas`},
	{"NumPy", []string{"numpy"}, `numpy`},
	{"ClickHouse", []string{"clickhouse"}, `clickhouse`},
	{"Elasticsearch", []string{"elasticsearch", "elastic search"}, `elasticsearch|elastic search`},
	{"Terraform", []string{"terraform"}, `terraform`},
	{"Ansible", []string{"ansible"}, `ansible`},
	{"GraphQL", []string{"graphql"}, `graphql`},
	{"gRPC", []string{"grpc"}, `grpc`},
}

func Contains(text, pattern string) bool {
	return regexp.MustCompile(`(?i)(?:^|[^\p{L}\p{N}_])(?:` + pattern + `)(?:$|[^\p{L}\p{N}_])`).MatchString(text)
}
func quote(s string) string {
	if strings.ContainsAny(s, " .+-#") {
		return `"` + s + `"`
	}
	return s
}
func aliases(t Technology) string {
	var q []string
	for _, s := range t.Aliases {
		q = append(q, quote(s))
	}
	return "(" + strings.Join(q, " OR ") + ")"
}

type Proposal struct {
	Expression   string   `json:"expression"`
	Explanations []string `json:"explanations"`
	Technologies []string `json:"technologies"`
}

// Optimize keeps the original public API for callers that do not need
// exclusions. Use OptimizeWithExclusions for the search form.
func Optimize(query, mode string) (Proposal, error) {
	return OptimizeWithExclusions(query, mode, "")
}

// OptimizeWithExclusions turns a plain-language request into hh.ru query
// syntax and appends title/description exclusions as one safe NOT clause.
// Exclusions are quoted as phrases, so operators typed into the separate field
// cannot change the rest of the expression.
func OptimizeWithExclusions(query, mode, excludeWords string) (Proposal, error) {
	query = strings.TrimSpace(query)
	if query == "" || len(query) > 1500 {
		return Proposal{}, errors.New("Введите запрос длиной от 1 до 1500 символов")
	}
	if mode != "roles" && mode != "stack" {
		return Proposal{}, errors.New("Неизвестный режим релевантности")
	}
	if isHHExpression(query) {
		p := Proposal{query, []string{"Обнаружен язык запросов hh.ru. Ваше выражение сохранено без изменений."}, []string{}}
		return appendExclusions(p, excludeWords), nil
	}
	var found []Technology
	for _, t := range Technologies {
		if Contains(query, t.Pattern) {
			found = append(found, t)
		}
	}
	// Preserve user's order: the first technology defines the role, other technologies narrow the stack.
	for i := 0; i < len(found); i++ {
		for j := i + 1; j < len(found); j++ {
			if technologyIndex(query, found[j]) < technologyIndex(query, found[i]) {
				found[i], found[j] = found[j], found[i]
			}
		}
	}
	var terms, names []string
	remaining := strings.ToLower(query)
	for i, t := range found {
		names = append(names, t.Name)
		a := aliases(t)
		if i == 0 && mode == "roles" {
			if t.Name == "Go" {
				terms = append(terms, `NAME:(golang OR "go developer" OR "go engineer" OR "go разработчик" OR "разработчик go" OR "go-разработчик" OR "программист go")`)
			} else {
				terms = append(terms, "NAME:"+a)
			}
		} else {
			terms = append(terms, a)
		}
		remaining = regexp.MustCompile(`(?i)(?:`+t.Pattern+`)`).ReplaceAllString(remaining, " ")
	}
	remaining = regexp.MustCompile(`(?i)(?:\bdeveloper\b|\bengineer\b|разработчик[а-я]*|программист[а-я]*|\band\b|\bи\b)`).ReplaceAllString(remaining, " ")
	remaining = strings.Trim(remaining, " ,;/+-\t\n")
	if len(found) == 0 {
		a := expandRoleTerms(query)
		if mode == "roles" {
			terms = append(terms, "NAME:("+a+")")
		} else {
			terms = append(terms, "("+a+")")
		}
	} else if remaining != "" {
		terms = append(terms, "("+expandRoleTerms(remaining)+")")
	}
	explanations := []string{fmt.Sprintf("Распознано технологий: %d. Варианты написания объединены через OR; разные технологии: через AND.", len(found))}
	if mode == "roles" {
		explanations = append(explanations, "Основная технология ищется в названии вакансии. Это уменьшает число смежных профессий.")
	} else {
		explanations = append(explanations, "Поиск по всем полям вакансии: разработка, аналитика, QA, ML и другие специальности.")
	}
	explanations = append(explanations, "Поиск начнётся только после подтверждения. Можно изменить любое условие.")
	return appendExclusions(Proposal{strings.Join(terms, " AND "), explanations, names}, excludeWords), nil
}

func isHHExpression(query string) bool {
	if regexp.MustCompile(`(?i)\b(?:NAME|DESCRIPTION|COMPANY_NAME|AREA|PROFESSIONAL_ROLE|EMPLOYMENT_FORM|WORK_FORMAT):`).MatchString(query) {
		return true
	}
	// Uppercase boolean operators are the notation documented by hh.ru. A
	// lowercase "and" in a natural-language request remains optimizable.
	return regexp.MustCompile(`\b(?:AND|OR|NOT)\b`).MatchString(query) && (strings.ContainsAny(query, "()\"") || strings.Contains(query, ":"))
}

func parseExcludeWords(raw string) []string {
	parts := strings.FieldsFunc(raw, func(r rune) bool { return r == ',' || r == ';' || r == '\n' || r == '\r' })
	seen := map[string]bool{}
	out := []string{}
	for _, part := range parts {
		word := strings.Join(strings.Fields(strings.Trim(part, " \t\"")), " ")
		if word == "" {
			continue
		}
		if len([]rune(word)) > 80 {
			word = string([]rune(word)[:80])
		}
		key := strings.ToLower(word)
		if !seen[key] {
			seen[key] = true
			out = append(out, word)
		}
		if len(out) == 20 {
			break
		}
	}
	return out
}

func appendExclusions(p Proposal, raw string) Proposal {
	words := parseExcludeWords(raw)
	if len(words) == 0 {
		return p
	}
	terms := make([]string, 0, len(words)*2)
	for _, word := range words {
		quoted := `"` + strings.ReplaceAll(word, `"`, "") + `"`
		terms = append(terms, "NAME:"+quoted, "DESCRIPTION:"+quoted)
	}
	clause := "NOT (" + strings.Join(terms, " OR ") + ")"
	if !strings.Contains(p.Expression, clause) {
		if p.Expression != "" {
			p.Expression += " AND "
		}
		p.Expression += clause
	}
	p.Explanations = append(p.Explanations, "Исключения применены к названию и описанию вакансии через NOT.")
	return p
}

// ApplyExclusions adds the same normalized NOT clause used by Optimize. It is
// used at the API boundary so a manually edited expression cannot accidentally
// drop the separate exclusion field.
func ApplyExclusions(expression, raw string) string {
	p := appendExclusions(Proposal{Expression: strings.TrimSpace(expression)}, raw)
	return p.Expression
}

func expandRoleTerms(query string) string {
	cleaned := strings.Join(strings.Fields(query), " ")
	lower := strings.ToLower(cleaned)
	roles := []struct {
		pattern   string
		expansion string
	}{
		{`backend|бэкенд|бекенд`, `backend OR бэкенд OR бекенд`},
		{`frontend|фронтенд|фронтэнд`, `frontend OR фронтенд OR фронтэнд`},
		{`full.?stack|фулл.?стек`, `fullstack OR "full stack" OR фуллстек OR "фулл стек"`},
		{`devops|девопс`, `devops OR девопс`},
		{`qa|тестировщик|тестирование`, `QA OR тестировщик OR тестирование`},
		{`data scientist|дата.?сайентист`, `"data scientist" OR "дата сайентист"`},
	}
	for _, role := range roles {
		if regexp.MustCompile(`(?i)(?:^|[^\p{L}\p{N}_])(?:` + role.pattern + `)(?:$|[^\p{L}\p{N}_])`).MatchString(lower) {
			return role.expansion
		}
	}
	return quote(cleaned)
}

func technologyIndex(text string, t Technology) int {
	x := regexp.MustCompile(`(?i)(?:^|[^\p{L}\p{N}_])(?:` + t.Pattern + `)(?:$|[^\p{L}\p{N}_])`).FindStringIndex(text)
	if x == nil {
		return len(text)
	}
	return x[0]
}

func ValidateExpression(s string) error {
	if strings.TrimSpace(s) == "" || len(s) > 3000 {
		return errors.New("Запрос должен содержать от 1 до 3000 символов")
	}
	depth := 0
	quoted := false
	for _, c := range s {
		if c == '"' {
			quoted = !quoted
		}
		if quoted {
			continue
		}
		if c == '(' {
			depth++
		}
		if c == ')' {
			depth--
			if depth < 0 {
				return errors.New("Проверьте закрывающие скобки запроса")
			}
		}
	}
	if depth != 0 || quoted {
		return errors.New("Проверьте парность скобок и кавычек")
	}
	return nil
}
