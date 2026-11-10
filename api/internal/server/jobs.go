package server

import (
	"context"
	"errors"
	"fmt"
	"hh-analytics/internal/core"
	"log"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Jobs struct {
	Store   *Store
	Runner  *Runner
	mu      sync.Mutex
	running map[string]context.CancelFunc
	slot    chan struct{}
}

func NewJobs(s *Store, r *Runner) *Jobs {
	return &Jobs{s, r, sync.Mutex{}, map[string]context.CancelFunc{}, make(chan struct{}, 1)}
}
func (j *Jobs) Start(id string) bool {
	j.mu.Lock()
	defer j.mu.Unlock()
	if _, ok := j.running[id]; ok {
		return false
	}
	ctx, cancel := context.WithCancel(context.Background())
	j.running[id] = cancel
	go func() {
		defer func() { j.mu.Lock(); delete(j.running, id); j.mu.Unlock(); cancel() }()
		select {
		case j.slot <- struct{}{}:
			defer func() { <-j.slot }()
		case <-ctx.Done():
			j.finishCanceled(id)
			return
		}
		j.run(ctx, id)
	}()
	return true
}
func (j *Jobs) Cancel(id string) {
	j.mu.Lock()
	defer j.mu.Unlock()
	if c, ok := j.running[id]; ok {
		c()
	}
}
func (j *Jobs) Active(id string) bool {
	j.mu.Lock()
	defer j.mu.Unlock()
	_, ok := j.running[id]
	return ok
}
func (j *Jobs) Shutdown() {
	j.mu.Lock()
	defer j.mu.Unlock()
	for _, cancel := range j.running {
		cancel()
	}
}
func (j *Jobs) finishCanceled(id string) {
	a, err := j.Store.Get(context.Background(), id)
	if err == nil {
		j.finish(&a, "cancelled", "Сбор остановлен. Собранные данные сохранены.", nil)
	}
}
func (j *Jobs) save(a *core.Analysis) error { return j.Store.Save(context.Background(), a) }
func (j *Jobs) finish(a *core.Analysis, status, message string, runErr error) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	v, err := j.Store.Vacancies(ctx, a.ID)
	if err != nil {
		log.Printf("load snapshots: %v", err)
		return
	}
	a.Collected = len(v)
	a.Processed = 0
	a.Failed = 0
	for _, x := range v {
		if x.Loaded {
			a.Processed++
		} else if x.Error != "" {
			a.Failed++
		}
	}
	a.Report = core.BuildReport(v)
	a.Status = status
	a.Stage = "done"
	a.Message = message
	if runErr != nil {
		a.Error = runErr.Error()
	}
	now := time.Now().UTC()
	a.CompletedAt = &now
	if err = j.Store.Save(ctx, a); err != nil {
		log.Printf("save final analysis: %v", err)
	}
}
func (j *Jobs) fail(ctx context.Context, a *core.Analysis, err error) {
	if ctx.Err() != nil {
		j.finish(a, "cancelled", "Сбор остановлен. Можно продолжить позже.", nil)
		return
	}
	var p *ProviderError
	if errors.As(err, &p) {
		message := "Источник временно недоступен. Данные сохранены."
		if p.Class == "auth" || p.Class == "blocked" {
			message = "Нужно восстановить доступ к hh.ru."
		}
		if p.Class == "rate" {
			message = "hh.ru ограничил частоту запросов. Повторите позже."
		}
		j.finish(a, "attention", message, err)
		return
	}
	j.finish(a, "attention", "Сбор прерван. Сохранённые данные доступны.", err)
}

type SearchItem struct{ Title, URL, Employer, Address, Compensation string }

type SearchResult struct {
	Items                     []SearchItem `json:"items"`
	Total                     int          `json:"total"`
	TotalKnown                bool         `json:"totalKnown"`
	Recognized                bool         `json:"recognized"`
	NextURL                   string       `json:"nextUrl"`
	VisibleLastPage, PageSize int
	NextPage                  *int  `json:"nextPage"`
	HasMore                   *bool `json:"hasMore"`
	CurrentPage               *int  `json:"currentPage"`
}

var vacancyPath = regexp.MustCompile(`^/vacancy/(\d+)/?$`)

func vacancyID(raw string) string {
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || (u.Hostname() != "hh.ru" && !strings.HasSuffix(u.Hostname(), ".hh.ru")) {
		return ""
	}
	match := vacancyPath.FindStringSubmatch(u.Path)
	if len(match) != 2 {
		return ""
	}
	return match[1]
}

func pageSignature(page SearchResult) string {
	ids := map[string]bool{}
	for _, item := range page.Items {
		ids[vacancyID(item.URL)] = true
	}
	keys := make([]string, 0, len(ids))
	for id := range ids {
		keys = append(keys, id)
	}
	sort.Strings(keys)
	return strings.Join(keys, ",")
}

func searchHasMore(page SearchResult, index int) bool {
	return page.NextURL != "" || (page.HasMore != nil && *page.HasMore) ||
		(page.NextPage != nil && *page.NextPage > index) || page.VisibleLastPage > index+1 ||
		(page.PageSize > 0 && page.Total > (index+1)*page.PageSize)
}

func validateSearchPage(page SearchResult, index int, seen map[string]bool) error {
	bad := func(reason string) error { return &ProviderError{Class: "drift", Reason: reason} }
	if page.CurrentPage != nil && *page.CurrentPage != index {
		return bad("hh.ru вернул другую страницу выдачи")
	}
	if len(page.Items) == 0 {
		if searchHasMore(page, index) || (page.Total > 0 && (page.PageSize == 0 || index*page.PageSize < page.Total)) {
			return bad("hh.ru вернул пустую страницу до конца выдачи")
		}
		if !page.Recognized && !page.TotalKnown && page.HasMore == nil {
			return bad("Не удалось подтвердить пустую выдачу hh.ru")
		}
		return nil
	}
	ids := map[string]bool{}
	for _, item := range page.Items {
		id := vacancyID(item.URL)
		if id == "" {
			return bad("В выдаче обнаружена некорректная ссылка на вакансию")
		}
		ids[id] = true
	}
	if page.PageSize > 0 && page.Total > 0 {
		expected := min(page.PageSize, max(0, page.Total-index*page.PageSize))
		if len(ids) < expected {
			return bad(fmt.Sprintf("Неполная страница hh.ru: %d из %d ссылок", len(ids), expected))
		}
	}
	if seen[pageSignature(page)] {
		return bad("hh.ru повторил уже полученную страницу выдачи")
	}
	return nil
}

func validateDetail(detail Detail) error {
	if strings.TrimSpace(detail.Title) == "" || strings.TrimSpace(detail.Description) == "" {
		return &ProviderError{Class: "drift", Reason: "hh.ru не вернул название и полное описание вакансии"}
	}
	return nil
}

func stopsCollection(err error) bool {
	var provider *ProviderError
	return errors.As(err, &provider) && provider.Class != "input" && provider.Class != "error" && provider.Class != "drift"
}

type Detail struct {
	Title, Company, Salary, Experience, Employment, EmploymentForm, WorkSchedule, WorkingHours, Address, City, Description, PublishedAt string
	WorkFormats, KeySkills                                                                                                              []string
	ResponseCount                                                                                                                       *int
}

func (j *Jobs) run(ctx context.Context, id string) {
	a, err := j.Store.Get(ctx, id)
	if err != nil {
		log.Printf("load job: %v", err)
		return
	}
	a.Status = "running"
	a.Error = ""
	a.CompletedAt = nil
	a.Warnings = []string{}
	// Older jobs omitted links already loaded by a different analysis.
	if a.Skipped > 0 {
		a.NextPage = 0
		a.SearchDone = false
		a.Skipped = 0
	}
	a.Stage = "links"
	a.Message = "Собираем ссылки на вакансии"
	if err = j.save(&a); err != nil {
		j.fail(ctx, &a, err)
		return
	}
	existing, err := j.Store.Vacancies(ctx, id)
	if err != nil {
		j.fail(ctx, &a, err)
		return
	}
	seen := map[string]bool{}
	for _, v := range existing {
		if v.Loaded && validateDetail(Detail{Title: v.Title, Description: v.Description}) != nil {
			v.Loaded = false
			if err = j.Store.PutVacancy(ctx, id, v, true); err != nil {
				j.fail(ctx, &a, err)
				return
			}
		}
		seen[v.ID] = true
	}
	a.Collected = len(seen)
	pagesSeen := map[string]bool{}
	var searchErr error
	passes := 0
	for !a.SearchDone && a.NextPage < 40 {
		if ctx.Err() != nil {
			j.fail(ctx, &a, ctx.Err())
			return
		}
		args := map[string]string{"text": a.Expression, "page": strconv.Itoa(a.NextPage)}
		for key, value := range a.Filters {
			if value != "" {
				args[key] = value
			}
		}
		attemptItems := []SearchItem{}
		result, page, err := callRunner(ctx, j.Runner, "search", args, func(page SearchResult) error {
			attemptItems = append(attemptItems, page.Items...)
			return validateSearchPage(page, a.NextPage, pagesSeen)
		})
		if err != nil {
			if ctx.Err() != nil || stopsCollection(err) {
				j.fail(ctx, &a, err)
				return
			}
			searchErr = err
		}
		if result.Healed {
			a.Warnings = append(a.Warnings, "api-anything обновил операцию: "+fmt.Sprint(result.Heal.Changes))
		}
		if page.TotalKnown || page.Total > 0 {
			a.Found = page.Total
		}
		for _, item := range attemptItems {
			vid := vacancyID(item.URL)
			if vid == "" || seen[vid] {
				continue
			}
			seen[vid] = true
			v := core.Vacancy{ID: vid, URL: "https://hh.ru/vacancy/" + vid, Title: item.Title, Company: item.Employer, Salary: item.Compensation, Address: item.Address, CollectedAt: time.Now().UTC(), KeySkills: []string{}, WorkFormats: []string{}, Requirements: []core.Requirement{}}
			if err = j.Store.PutVacancy(ctx, id, v, false); err != nil {
				j.fail(ctx, &a, err)
				return
			}
		}
		a.Collected = len(seen)
		if searchErr != nil {
			break
		}
		pagesSeen[pageSignature(page)] = true
		hasMore := searchHasMore(page, a.NextPage)
		a.NextPage++
		a.Message = fmt.Sprintf("Собираем ссылки · %d вакансий · страница %d", a.Collected, a.NextPage)
		if !hasMore {
			if a.Found > a.Collected && passes < 2 {
				passes++
				a.NextPage = 0
				pagesSeen = map[string]bool{}
				a.Message = fmt.Sprintf("Проверяем недостающие ссылки · %d из %d · проход %d", a.Collected, a.Found, passes+1)
			} else if a.Found > a.Collected {
				a.NextPage = 0
				searchErr = &ProviderError{Class: "drift", Reason: fmt.Sprintf("После трёх проходов собрано %d из %d ссылок", a.Collected, a.Found)}
			} else {
				a.SearchDone = true
			}
		}
		if err = j.save(&a); err != nil {
			j.fail(ctx, &a, err)
			return
		}
		if searchErr != nil {
			break
		}
	}
	if !a.SearchDone && a.NextPage >= 40 {
		a.Warnings = append(a.Warnings, "Достигнуто ограничение известной операции hh.ru: 40 страниц. Для полного охвата сузьте запрос или фильтры.")
		searchErr = &ProviderError{Class: "input", Reason: "hh.ru ограничивает выдачу 40 страницами. Для полного охвата сузьте запрос или фильтры."}
	}
	if a.Found > a.Collected {
		a.Warnings = append(a.Warnings, fmt.Sprintf("Выдача hh.ru: %d, собрано уникальных: %d. Статистика рассчитана по загруженным вакансиям.", a.Found, a.Collected))
	}
	a.Stage = "details"
	a.Message = "Загружаем описания вакансий"
	if err = j.save(&a); err != nil {
		j.fail(ctx, &a, err)
		return
	}
	vacancies, err := j.Store.Vacancies(ctx, id)
	if err != nil {
		j.fail(ctx, &a, err)
		return
	}
	a.Processed = 0
	a.Failed = 0
	for _, v := range vacancies {
		if v.Loaded {
			a.Processed++
		}
	}
	for _, v := range vacancies {
		if v.Loaded {
			continue
		}
		if ctx.Err() != nil {
			j.fail(ctx, &a, ctx.Err())
			return
		}
		result, detail, err := callRunner(ctx, j.Runner, "vacancy", map[string]string{"vacancyId": v.ID}, validateDetail)
		if err != nil {
			if ctx.Err() != nil || stopsCollection(err) {
				j.fail(ctx, &a, err)
				return
			}
			v.Error = err.Error()
			a.Failed++
		} else {
			if result.Healed {
				a.Warnings = append(a.Warnings, "api-anything обновил операцию: "+fmt.Sprint(result.Heal.Changes))
			}
			v.Title = detail.Title
			v.Company = detail.Company
			v.Salary = detail.Salary
			v.Experience = detail.Experience
			v.Employment = detail.Employment
			v.EmploymentForm = detail.EmploymentForm
			v.WorkFormats = detail.WorkFormats
			v.WorkSchedule = detail.WorkSchedule
			v.WorkingHours = detail.WorkingHours
			if detail.Address != "" {
				v.Address = detail.Address
			}
			v.City = detail.City
			v.Description = detail.Description
			v.KeySkills = detail.KeySkills
			v.ResponseCount = detail.ResponseCount
			v.PublishedAt = detail.PublishedAt
			v.CollectedAt = time.Now().UTC()
			v.Loaded = true
			v.Error = ""
			core.NormalizeVacancy(&v)
			a.Processed++
		}
		if err = j.Store.PutVacancy(ctx, id, v, true); err != nil {
			j.fail(ctx, &a, err)
			return
		}
		a.Message = fmt.Sprintf("Загружаем описания · %d из %d", a.Processed+a.Failed, a.Collected)
		if err = j.save(&a); err != nil {
			j.fail(ctx, &a, err)
			return
		}
	}
	a.Stage = "analysis"
	a.Message = "Анализируем навыки, требования и конкуренцию"
	if err = j.save(&a); err != nil {
		j.fail(ctx, &a, err)
		return
	}
	status := "completed"
	message := "Анализ готов"
	if a.Processed != a.Collected || a.Found > a.Collected || !a.SearchDone || searchErr != nil {
		status = "partial"
		message = "Анализ готов по доступным данным"
	}
	j.finish(&a, status, message, searchErr)
}
