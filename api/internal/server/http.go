package server

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"hh-analytics/internal/core"
	"io"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"
)

type Server struct {
	Store         *Store
	Runner        *Runner
	Jobs          *Jobs
	filtersMu     sync.Mutex
	filters       json.RawMessage
	filtersAt     time.Time
	ratesState    currencyRatesCache
	ratesEndpoint string
	ratesClient   *http.Client
}

func New(s *Store, r *Runner) *Server { return &Server{Store: s, Runner: r, Jobs: NewJobs(s, r)} }
func write(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		log.Print(err)
	}
}
func fail(w http.ResponseWriter, status int, message string) {
	write(w, status, map[string]string{"error": message})
}
func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 32768)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if err := d.Decode(v); err != nil {
		fail(w, 400, "Проверьте формат запроса")
		return false
	}
	if d.Decode(new(any)) != io.EOF {
		fail(w, 400, "Ожидался один JSON-объект")
		return false
	}
	return true
}
func (s *Server) Handler() http.Handler {
	m := http.NewServeMux()
	m.HandleFunc("GET /api/health", s.health)
	m.HandleFunc("GET /api/filters", s.getFilters)
	m.HandleFunc("GET /api/rates", s.rates)
	m.HandleFunc("POST /api/prepare", s.prepare)
	m.HandleFunc("GET /api/analyses", s.list)
	m.HandleFunc("POST /api/analyses", s.create)
	m.HandleFunc("POST /api/analyses/{id}/delete", s.deleteAnalysis)
	m.HandleFunc("POST /api/analyses/{id}/restore", s.restoreAnalysis)
	m.HandleFunc("GET /api/analyses/{id}", s.get)
	m.HandleFunc("GET /api/analyses/{id}/vacancies", s.vacancies)
	m.HandleFunc("POST /api/analyses/{id}/cancel", s.cancel)
	m.HandleFunc("POST /api/analyses/{id}/resume", s.resume)
	m.HandleFunc("POST /api/analyses/{id}/refresh", s.refresh)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		if r.Method == "POST" {
			if origin := r.Header.Get("Origin"); origin != "" {
				u, err := url.Parse(origin)
				if err != nil || (u.Hostname() != "localhost" && u.Hostname() != "127.0.0.1" && u.Hostname() != "[::1]") {
					fail(w, 403, "Недопустимый источник запроса")
					return
				}
			}
		}
		m.ServeHTTP(w, r)
	})
}
func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	if err := s.Store.DB.Ping(ctx); err != nil {
		fail(w, 503, "База данных недоступна")
		return
	}
	session := false
	req, _ := http.NewRequestWithContext(ctx, "GET", s.Runner.URL+"/health", nil)
	res, err := s.Runner.Client.Do(req)
	if err == nil {
		defer res.Body.Close()
		var state struct {
			Session bool `json:"session"`
		}
		if json.NewDecoder(res.Body).Decode(&state) == nil {
			session = state.Session
		}
	}
	write(w, 200, map[string]any{"ok": true, "session": session, "provider": "api-anything", "version": "1.0.0"})
}
func (s *Server) prepare(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Query        string `json:"query"`
		Mode         string `json:"mode"`
		ExcludeWords string `json:"excludeWords"`
	}
	if !decode(w, r, &input) {
		return
	}
	value, err := core.OptimizeWithExclusions(input.Query, input.Mode, input.ExcludeWords)
	if err != nil {
		fail(w, 400, err.Error())
		return
	}
	write(w, 200, value)
}
func (s *Server) getFilters(w http.ResponseWriter, r *http.Request) {
	s.filtersMu.Lock()
	defer s.filtersMu.Unlock()
	if len(s.filters) > 0 && time.Since(s.filtersAt) < 6*time.Hour {
		write(w, 200, map[string]any{"groups": s.filters, "fetchedAt": s.filtersAt, "source": "hh.ru / api-anything"})
		return
	}
	result, err := s.Runner.Call(r.Context(), "filters", map[string]string{"text": "разработчик", "page": "0"}, nil)
	if err != nil {
		write(w, 502, map[string]any{"error": "Не удалось загрузить фильтры hh.ru", "reason": result.Reason, "next": result.Next})
		return
	}
	s.filters = result.Data
	s.filtersAt = time.Now().UTC()
	write(w, 200, map[string]any{"groups": s.filters, "fetchedAt": s.filtersAt, "source": "hh.ru / api-anything"})
}
func (s *Server) list(w http.ResponseWriter, r *http.Request) {
	v, err := s.Store.List(r.Context())
	if err != nil {
		fail(w, 500, "Не удалось прочитать историю")
		return
	}
	write(w, 200, v)
}

func (s *Server) deleteAnalysis(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !validAnalysisID(w, id) {
		return
	}
	changed, err := s.Store.SetDeleted(r.Context(), []string{id}, true)
	if err != nil {
		fail(w, 500, "Не удалось удалить анализ")
		return
	}
	if len(changed) == 0 {
		fail(w, 404, "Анализ не найден")
		return
	}
	s.Jobs.Cancel(id)
	write(w, 200, map[string]any{"deleted": changed})
}
func (s *Server) restoreAnalysis(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !validAnalysisID(w, id) {
		return
	}
	changed, err := s.Store.SetDeleted(r.Context(), []string{id}, false)
	if err != nil {
		fail(w, 500, "Не удалось восстановить анализ")
		return
	}
	if len(changed) == 0 {
		fail(w, 404, "Анализ не найден")
		return
	}
	write(w, 200, map[string]any{"restored": changed})
}
func validAnalysisID(w http.ResponseWriter, id string) bool {
	if !regexp.MustCompile(`^[a-f0-9]{24}$`).MatchString(id) {
		fail(w, 400, "Некорректный идентификатор анализа")
		return false
	}
	return true
}
func (s *Server) create(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Query        string       `json:"query"`
		Title        string       `json:"title"`
		ExcludeWords string       `json:"excludeWords"`
		Expression   string       `json:"expression"`
		Mode         string       `json:"mode"`
		Filters      core.Filters `json:"filters"`
		FilterLabels core.Filters `json:"filterLabels"`
		Confirmed    bool         `json:"confirmed"`
	}
	if !decode(w, r, &input) {
		return
	}
	if !input.Confirmed {
		fail(w, 400, "Сначала подтвердите поисковый запрос")
		return
	}
	if len(input.ExcludeWords) > 1600 {
		fail(w, 400, "Исключения слишком длинные")
		return
	}
	if _, err := core.OptimizeWithExclusions(input.Query, input.Mode, input.ExcludeWords); err != nil {
		fail(w, 400, err.Error())
		return
	}
	if err := core.ValidateExpression(input.Expression); err != nil {
		fail(w, 400, err.Error())
		return
	}
	input.Expression = core.ApplyExclusions(input.Expression, input.ExcludeWords)
	if err := core.ValidateExpression(input.Expression); err != nil {
		fail(w, 400, err.Error())
		return
	}
	allowed := map[string]bool{"area": true, "experience": true, "employment_form": true, "work_format": true, "education": true, "professional_role": true, "work_schedule_by_days": true, "working_hours": true}
	for k, v := range input.Filters {
		if !allowed[k] || !regexp.MustCompile(`^[\p{L}\p{N}_-]{0,80}$`).MatchString(v) {
			fail(w, 400, "Недопустимый фильтр")
			return
		}
	}
	b := make([]byte, 12)
	if _, err := rand.Read(b); err != nil {
		fail(w, 500, "Не удалось создать анализ")
		return
	}
	now := time.Now().UTC()
	title := strings.TrimSpace(input.Title)
	if title == "" {
		title = strings.TrimSpace(input.Query)
	}
	if len([]rune(title)) > 180 {
		fail(w, 400, "Название поиска должно быть не длиннее 180 символов")
		return
	}
	a := core.Analysis{ID: hex.EncodeToString(b), Title: title, Query: input.Query, ExcludeWords: input.ExcludeWords, Expression: input.Expression, Mode: input.Mode, Filters: input.Filters, Status: "queued", Stage: "queued", Message: "Ожидаем начала сбора", CreatedAt: now, UpdatedAt: now, Warnings: []string{}}
	a.FilterLabels = input.FilterLabels
	if a.Filters == nil {
		a.Filters = core.Filters{}
	}
	if err := s.Store.Save(r.Context(), &a); err != nil {
		fail(w, 500, "Не удалось сохранить анализ")
		return
	}
	s.Jobs.Start(a.ID)
	write(w, 201, a)
}
func (s *Server) get(w http.ResponseWriter, r *http.Request) {
	a, err := s.Store.Get(r.Context(), r.PathValue("id"))
	if err != nil {
		if IsMissing(err) {
			fail(w, 404, "Анализ не найден")
		} else {
			fail(w, 500, "Не удалось прочитать анализ")
		}
		return
	}
	write(w, 200, a)
}
func (s *Server) vacancies(w http.ResponseWriter, r *http.Request) {
	if _, err := s.Store.Get(r.Context(), r.PathValue("id")); err != nil {
		fail(w, 404, "Анализ не найден")
		return
	}
	v, err := s.Store.Vacancies(r.Context(), r.PathValue("id"))
	if err != nil {
		fail(w, 500, "Не удалось прочитать вакансии")
		return
	}
	write(w, 200, v)
}
func (s *Server) cancel(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := s.Store.Get(r.Context(), id); err != nil {
		fail(w, 404, "Анализ не найден")
		return
	}
	s.Jobs.Cancel(id)
	write(w, 200, map[string]bool{"ok": true})
}
func (s *Server) resume(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	a, err := s.Store.Get(r.Context(), id)
	if err != nil {
		fail(w, 404, "Анализ не найден")
		return
	}
	if s.Jobs.Active(id) {
		fail(w, 409, "Анализ уже выполняется")
		return
	}
	if a.Status == "completed" || (a.Status == "partial" && a.Failed == 0 && (a.Found <= a.Collected || a.NextPage >= 40)) {
		fail(w, 409, "Анализ уже завершён. Запустите новый поиск для обновления.")
		return
	}
	if a.Status == "partial" && a.Found > a.Collected && a.NextPage < 40 {
		a.NextPage = 0
		a.SearchDone = false
		a.Warnings = []string{}
	}
	a.Status = "queued"
	a.Stage = "queued"
	a.Message = "Продолжаем сбор сохранённого анализа"
	a.Error = ""
	if err = s.Store.Save(r.Context(), &a); err != nil {
		fail(w, 500, "Не удалось продолжить анализ")
		return
	}
	s.Jobs.Start(id)
	write(w, 200, a)
}

func (s *Server) refresh(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	a, err := s.Store.Get(r.Context(), id)
	if err != nil {
		fail(w, 404, "Анализ не найден")
		return
	}
	if s.Jobs.Active(id) {
		fail(w, 409, "Анализ уже выполняется")
		return
	}
	count, err := s.Store.ResetVacancies(r.Context(), id)
	if err != nil {
		fail(w, 500, "Не удалось подготовить обновление вакансий")
		return
	}
	a.Status = "queued"
	a.Stage = "queued"
	a.Message = "Ожидаем актуализации данных вакансий"
	a.Error = ""
	a.CompletedAt = nil
	a.Report = nil
	a.NextPage = 0
	a.SearchDone = true
	a.Found = count
	a.Collected = count
	a.Skipped = 0
	a.Processed = 0
	a.Failed = 0
	a.Warnings = []string{}
	if err = s.Store.Save(r.Context(), &a); err != nil {
		fail(w, 500, "Не удалось сохранить обновление")
		return
	}
	s.Jobs.Start(id)
	write(w, 200, a)
}
func (s *Server) Recover(ctx context.Context) error {
	rows, err := s.Store.List(ctx)
	if err != nil {
		return err
	}
	for _, a := range rows {
		if a.Status == "queued" || a.Status == "running" {
			a.Status = "interrupted"
			a.Stage = "done"
			a.Message = "Приложение перезапущено. Можно продолжить сбор."
			if err = s.Store.Save(ctx, &a); err != nil {
				return err
			}
		}
		// Upgrade pre-release derived metrics from saved source snapshots, without contacting hh.ru.
		if a.Status != "interrupted" {
			full, getErr := s.Store.Get(ctx, a.ID)
			if getErr != nil {
				return getErr
			}
			if full.Report != nil && (full.Report.Version == "rules-v1" || full.Report.Version == "rules-v2" || full.Report.Version == "rules-v3" || full.Report.Version == "rules-v4") {
				vacancies, loadErr := s.Store.Vacancies(ctx, a.ID)
				if loadErr != nil {
					return loadErr
				}
				for i := range vacancies {
					if vacancies[i].Loaded {
						core.NormalizeVacancy(&vacancies[i])
						if err = s.Store.PutVacancy(ctx, a.ID, vacancies[i], true); err != nil {
							return err
						}
					}
				}
				full.Report = core.BuildReport(vacancies)
				if err = s.Store.Save(ctx, &full); err != nil {
					return err
				}
			}
		}
	}
	return nil
}
