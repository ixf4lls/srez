package server

import (
	"context"
	"errors"
	"fmt"
	"hh-analytics/internal/core"
	"log"
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

type SearchResult struct {
	Items                     []struct{ Title, URL, Employer, Address, Compensation string } `json:"items"`
	Total                     int                                                            `json:"total"`
	NextURL                   string                                                         `json:"nextUrl"`
	VisibleLastPage, PageSize int
	NextPage                  *int  `json:"nextPage"`
	HasMore                   *bool `json:"hasMore"`
}
type Detail struct {
	Title, Company, Salary, Experience, Employment, WorkSchedule, WorkingHours, Address, City, Description, PublishedAt string
	WorkFormats, KeySkills                                                                                              []string
	ResponseCount                                                                                                       *int
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
		seen[v.ID] = true
	}
	pagesSeen := map[string]bool{}
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
		var page SearchResult
		result, err := j.Runner.Call(ctx, "search", args, &page)
		if err != nil {
			j.fail(ctx, &a, err)
			return
		}
		if result.Healed {
			a.Warnings = append(a.Warnings, "api-anything обновил операцию: "+fmt.Sprint(result.Heal.Changes))
		}
		if page.Total > 0 {
			a.Found = page.Total
		}
		pageIDs := []string{}
		for _, item := range page.Items {
			m := regexp.MustCompile(`/vacancy/(\d+)`).FindStringSubmatch(item.URL)
			if len(m) > 1 {
				pageIDs = append(pageIDs, m[1])
			}
		}
		sort.Strings(pageIDs)
		signature := strings.Join(pageIDs, ",")
		repeated := pagesSeen[signature]
		pagesSeen[signature] = true
		for _, item := range page.Items {
			match := regexp.MustCompile(`/vacancy/(\d+)`).FindStringSubmatch(item.URL)
			if len(match) < 2 || seen[match[1]] {
				continue
			}
			vid := match[1]
			seen[vid] = true
			v := core.Vacancy{ID: vid, URL: "https://hh.ru/vacancy/" + vid, Title: item.Title, Company: item.Employer, Salary: item.Compensation, Address: item.Address, CollectedAt: time.Now().UTC(), KeySkills: []string{}, WorkFormats: []string{}, Requirements: []core.Requirement{}}
			if err = j.Store.PutVacancy(ctx, id, v, false); err != nil {
				j.fail(ctx, &a, err)
				return
			}
		}
		a.Collected = len(seen)
		a.NextPage++
		if page.NextPage != nil && *page.NextPage >= a.NextPage {
			a.NextPage = *page.NextPage
		}
		a.Message = fmt.Sprintf("Собираем ссылки · %d вакансий · страница %d", a.Collected, a.NextPage)
		if len(page.Items) == 0 || (a.Found > 0 && a.Collected >= a.Found) {
			a.SearchDone = true
		}
		if repeated && len(page.Items) > 0 {
			a.SearchDone = true
			a.Warnings = append(a.Warnings, "hh.ru повторил страницу выдачи. Анализ охватывает только собранные уникальные вакансии.")
		}
		if page.NextURL == "" && page.VisibleLastPage <= a.NextPage && (a.Found == 0 || a.Collected >= a.Found) {
			a.SearchDone = true
		}
		if page.HasMore != nil && !*page.HasMore {
			a.SearchDone = true
		}
		if err = j.save(&a); err != nil {
			j.fail(ctx, &a, err)
			return
		}
	}
	if !a.SearchDone {
		a.SearchDone = true
		a.Warnings = append(a.Warnings, "Достигнуто ограничение известной операции hh.ru: 40 страниц. Для полного охвата сузьте запрос или фильтры.")
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
		var detail Detail
		result, err := j.Runner.Call(ctx, "vacancy", map[string]string{"vacancyId": v.ID}, &detail)
		if err != nil {
			var p *ProviderError
			if errors.As(err, &p) && p.Class == "input" {
				v.Error = "Вакансия удалена или недоступна"
				a.Failed++
				if e := j.Store.PutVacancy(ctx, id, v, true); e != nil {
					j.fail(ctx, &a, e)
					return
				}
				continue
			}
			j.fail(ctx, &a, err)
			return
		}
		if result.Healed {
			a.Warnings = append(a.Warnings, "api-anything обновил операцию: "+fmt.Sprint(result.Heal.Changes))
		}
		if detail.Title == "" {
			v.Error = "hh.ru не вернул полное описание"
			a.Failed++
		} else {
			v.Title = detail.Title
			v.Company = detail.Company
			v.Salary = detail.Salary
			v.Experience = detail.Experience
			v.Employment = detail.Employment
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
	if a.Failed > 0 || a.Found > a.Collected || len(a.Warnings) > 0 {
		status = "partial"
		message = "Анализ готов по доступным данным"
	}
	j.finish(&a, status, message, nil)
}
