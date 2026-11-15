package server

import (
	"context"
	"hh-analytics/internal/core"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"testing"
	"time"
)

const gradesBrowserAnalysisID = "000000000000000000000123"

func gradesBrowserVacancies() []core.Vacancy {
	var vacancies []core.Vacancy
	for index, item := range []struct {
		grade, title, city, salary string
		responses                  int
	}{
		{"Middle / Senior", "[Тест] Два грейда", "Москва", "200 000 ₽ за месяц, на руки", 10},
		{"Middle", "[Тест] Только Middle", "Казань", "100 000 ₽ за месяц, на руки", 20},
		{"Senior", "[Тест] Только Senior", "Москва", "300 000 ₽ за месяц, на руки", 30},
		{"Junior / Middle / Senior", "[Тест] Три грейда", "Казань", "400 000 ₽ за месяц, на руки", 40},
		{" middle / MIDDLE / senior // ", "[Тест] Повтор грейда", "Москва", "250 000 ₽ за месяц, на руки", 0},
		{" / ", "[Тест] Без грейда", "Москва", "", 0},
	} {
		count := item.responses
		v := core.Vacancy{
			ID: string(rune('1' + index)), URL: "https://example.invalid/vacancy/synthetic",
			Title: item.title, Company: "Тестовая компания", Grade: item.grade, City: item.city,
			Salary: item.salary, ResponseCount: &count, Loaded: true,
			Description: "Синтетическая вакансия: реальные хранилища и сервисы не используются.",
			WorkFormats: []string{"Удалённо"}, Format: "Удалённо", Experience: "От 3 до 6 лет",
			KeySkills: []string{}, Requirements: []core.Requirement{}, CollectedAt: time.Date(2026, 11, 15, 9, 0, 0, 0, time.UTC),
		}
		if index == 5 {
			v.ResponseCount = nil
		}
		vacancies = append(vacancies, v)
	}
	return vacancies
}

// Browser tests opt in explicitly. Only SQL and provider boundaries are mocked;
// Store serialization, HTTP handlers, report derivation and UI run unchanged.
func TestGradesBrowserServer(t *testing.T) {
	addr := os.Getenv("SREZ_GRADES_E2E_ADDR")
	if addr == "" {
		t.Skip("SREZ_GRADES_E2E_ADDR is not set")
	}
	host, _, err := net.SplitHostPort(addr)
	if err != nil || (host != "127.0.0.1" && host != "::1" && host != "localhost") {
		t.Fatal("SREZ_GRADES_E2E_ADDR must be loopback")
	}
	vacancies := gradesBrowserVacancies()
	f, _ := newGradesFixture(t, vacancies)
	now := time.Date(2026, 11, 15, 9, 0, 0, 0, time.UTC)
	a := core.Analysis{
		ID: gradesBrowserAnalysisID, Title: "[Тест] Составные грейды", Query: "Разработчик", Expression: "NAME:разработчик",
		Status: "completed", Stage: "done", Mode: "roles", Filters: core.Filters{}, FilterLabels: core.Filters{},
		CreatedAt: now, CompletedAt: &now, Found: len(vacancies), Collected: len(vacancies), Processed: len(vacancies),
		Warnings: []string{}, Report: core.BuildReport(vacancies),
	}
	if err := f.app.Store.Save(context.Background(), &a); err != nil {
		t.Fatal(err)
	}
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	srv := &http.Server{Handler: f.handler(), ReadHeaderTimeout: 5 * time.Second}
	t.Cleanup(func() { _ = srv.Close() })
	go func() {
		if err := srv.Serve(listener); err != nil && err != http.ErrServerClosed {
			t.Errorf("synthetic grades API: %v", err)
		}
	}()
	t.Logf("Synthetic grades API listening at http://%s", addr)
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	<-ctx.Done()
}
