package server

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"hh-analytics/internal/core"
	"net/http"
	"net/http/httptest"
	"reflect"
	"sort"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Intercept storage at the SQL boundary; Store serialization and recovery run
// unchanged. All other SQL and HTTP operations use the strict exclusions mocks.
type gradesDB struct {
	*exclusionsDB
	vacancies map[string][]byte
	failLoad  bool
	writes    int
}

func (db *gradesDB) Query(ctx context.Context, query string, args ...any) (pgx.Rows, error) {
	if query == `SELECT document FROM vacancies WHERE analysis_id=$1 ORDER BY id` {
		if db.failLoad {
			return nil, fmt.Errorf("synthetic vacancy storage failure")
		}
		ids := make([]string, 0, len(db.vacancies))
		for id := range db.vacancies {
			ids = append(ids, id)
		}
		sort.Strings(ids)
		documents := make([][]byte, 0, len(ids))
		for _, id := range ids {
			documents = append(documents, bytes.Clone(db.vacancies[id]))
		}
		return &exclusionsRows{documents: documents}, nil
	}
	return db.exclusionsDB.Query(ctx, query, args...)
}

func (db *gradesDB) Exec(ctx context.Context, query string, args ...any) (pgconn.CommandTag, error) {
	if query == `INSERT INTO vacancies(analysis_id,id,document) VALUES($1,$2,$3) ON CONFLICT(analysis_id,id) DO UPDATE SET document=excluded.document` {
		db.vacancies[args[1].(string)] = bytes.Clone(args[2].([]byte))
		db.writes++
		return pgconn.NewCommandTag("INSERT 0 1"), nil
	}
	return db.exclusionsDB.Exec(ctx, query, args...)
}

func newGradesFixture(t *testing.T, vacancies []core.Vacancy) (*exclusionsFixture, *gradesDB) {
	t.Helper()
	f := newExclusionsFixture(t)
	db := &gradesDB{exclusionsDB: f.app.Store.DB.(*exclusionsDB), vacancies: map[string][]byte{}}
	for _, vacancy := range vacancies {
		data, err := json.Marshal(vacancy)
		if err != nil {
			t.Fatal(err)
		}
		db.vacancies[vacancy.ID] = data
	}
	f.app.Store.DB = db
	return f, db
}

func TestGradesSavedReportRecoveryE2E(t *testing.T) {
	for _, version := range []string{"rules-v1", "rules-v2", "rules-v3", "rules-v4", "rules-v5"} {
		t.Run(version, func(t *testing.T) {
			responses := 0
			vacancies := []core.Vacancy{{ID: "both", Title: "Middle/Senior developer", Grade: "Middle / Senior", Salary: "100 000 ₽ за месяц, на руки", ResponseCount: &responses, Loaded: true}}
			f, db := newGradesFixture(t, vacancies)
			analysis := core.Analysis{ID: "000000000000000000000001", Status: "completed", CreatedAt: time.Now(), Report: &core.Report{Version: version, Total: 1, Dimensions: map[string][]core.Metric{"grade": {{Key: "Middle / Senior", Label: "Middle / Senior", Count: 1}}}}}
			if err := f.app.Store.Save(context.Background(), &analysis); err != nil {
				t.Fatal(err)
			}
			if err := f.app.Recover(context.Background()); err != nil {
				t.Fatal(err)
			}
			request := httptest.NewRequest(http.MethodGet, "/api/analyses/"+analysis.ID, nil)
			response := httptest.NewRecorder()
			f.app.Handler().ServeHTTP(response, request)
			if response.Code != http.StatusOK {
				t.Fatalf("GET report failed: %d %s", response.Code, response.Body.String())
			}
			var got core.Analysis
			if err := json.Unmarshal(response.Body.Bytes(), &got); err != nil {
				t.Fatal(err)
			}
			if got.Report.Version != "rules-v6" || got.Report.Total != 1 || got.Report.ResponseCoverage != 1 || *got.Report.ResponseMean != 0 {
				t.Fatalf("unexpected rebuilt report: %+v", got.Report)
			}
			metrics := got.Report.Dimensions["grade"]
			if len(metrics) != 2 || metrics[0].Label != "Middle" || metrics[1].Label != "Senior" {
				t.Fatalf("compound grades survived recovery: %+v", metrics)
			}
			for _, metric := range metrics {
				if metric.Count != 1 || metric.Percent != 100 || !reflect.DeepEqual(metric.VacancyIDs, []string{"both"}) {
					t.Fatalf("incorrect membership in API report: %+v", metric)
				}
			}
			if version == "rules-v5" && db.writes != 0 {
				t.Fatalf("v5 source snapshots were rewritten %d times", db.writes)
			}
			writes := db.writes
			if err := f.app.Recover(context.Background()); err != nil {
				t.Fatal(err)
			}
			if db.writes != writes {
				t.Fatal("recovery is not idempotent")
			}
			response = httptest.NewRecorder()
			f.app.Handler().ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/analyses/"+analysis.ID+"/vacancies", nil))
			var saved []core.Vacancy
			if err := json.Unmarshal(response.Body.Bytes(), &saved); err != nil || len(saved) != 1 || saved[0].Grade != "Middle / Senior" {
				t.Fatalf("source grade lost: %s, %v", response.Body.String(), err)
			}
		})
	}
}

func TestGradesRecoveryStorageFailureE2E(t *testing.T) {
	for _, failure := range []string{"load", "save"} {
		t.Run(failure, func(t *testing.T) {
			f, db := newGradesFixture(t, nil)
			analysis := core.Analysis{ID: "000000000000000000000001", Status: "completed", Report: &core.Report{Version: "rules-v5", Total: 1}}
			if err := f.app.Store.Save(context.Background(), &analysis); err != nil {
				t.Fatal(err)
			}
			before := bytes.Clone(f.documents[analysis.ID])
			db.failLoad = failure == "load"
			f.failSave = failure == "save"
			if err := f.app.Recover(context.Background()); err == nil {
				t.Fatal("recovery ignored storage failure")
			}
			if !bytes.Equal(f.documents[analysis.ID], before) {
				t.Fatal("failed migration overwrote original report")
			}
		})
	}
}
