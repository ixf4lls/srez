package server

import (
	"context"
	"encoding/json"
	"hh-analytics/internal/core"
	"net/http"
	"strconv"
	"sync"
	"testing"
	"time"
)

func searchFixture(total, size int, more bool, ids ...string) SearchResult {
	page := SearchResult{Total: total, TotalKnown: true, PageSize: size, HasMore: &more}
	for _, id := range ids {
		page.Items = append(page.Items, SearchItem{Title: "Listing " + id, URL: "https://hh.ru/vacancy/" + id + "?from=search"})
	}
	return page
}

func saveJob(t *testing.T, store *Store, a core.Analysis) {
	t.Helper()
	a.CreatedAt = time.Now().UTC()
	a.Status = "cancelled"
	if err := store.Save(context.Background(), &a); err != nil {
		t.Fatal(err)
	}
}

func TestCollectionIncludesOtherAnalysesAndRetriesEachPageAndDetail(t *testing.T) {
	store := isolatedStore(t)
	ctx := context.Background()
	saveJob(t, store, core.Analysis{ID: "previous"})
	if err := store.PutVacancy(ctx, "previous", core.Vacancy{ID: "101", Title: "Previously loaded", Description: "Old snapshot", Loaded: true}, false); err != nil {
		t.Fatal(err)
	}
	saveJob(t, store, core.Analysis{ID: "current", Expression: "NAME:developer", Filters: core.Filters{"area": "1"}, Found: 3, Skipped: 1, NextPage: 2, SearchDone: true})
	var mu sync.Mutex
	calls := map[string]int{}
	runner := testRunner(t, func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		var args map[string]string
		if err := json.NewDecoder(r.Body).Decode(&args); err != nil {
			t.Error(err)
		}
		key := r.URL.Path + ":" + args["page"] + args["vacancyId"]
		calls[key]++
		var data any
		if r.URL.Path == "/search" {
			if args["text"] != "NAME:developer" || args["area"] != "1" {
				t.Errorf("search changed filters: %+v", args)
			}
			if args["page"] == "0" || calls[key] == 1 {
				page := searchFixture(3, 2, true, "101", "102")
				next := 7
				page.NextPage = &next
				data = page
			} else {
				data = searchFixture(3, 2, false, "103")
			}
		} else {
			if args["vacancyId"] == "101" && calls[key] == 1 {
				http.Error(w, "temporary", http.StatusServiceUnavailable)
				return
			}
			detail := Detail{Title: "Fresh " + args["vacancyId"], Description: "Go and PostgreSQL"}
			if args["vacancyId"] == "102" && calls[key] == 1 {
				detail.Description = ""
			}
			data = detail
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "data": data})
	})
	NewJobs(store, runner).run(ctx, "current")
	a, err := store.Get(ctx, "current")
	if err != nil || a.Status != "completed" || a.Collected != 3 || a.Processed != 3 || a.Failed != 0 || a.Skipped != 0 || !a.SearchDone {
		t.Fatalf("incomplete collection: %+v err=%v", a, err)
	}
	mu.Lock()
	defer mu.Unlock()
	for key, want := range map[string]int{"/search:0": 1, "/search:1": 2, "/vacancy:101": 2, "/vacancy:102": 2, "/vacancy:103": 1} {
		if calls[key] != want {
			t.Errorf("%s calls=%d want=%d", key, calls[key], want)
		}
	}
	if calls["/search:7"] != 0 {
		t.Fatal("pagination skipped pages")
	}
	vs, err := store.Vacancies(ctx, "current")
	if err != nil || len(vs) != 3 || vs[0].Title != "Fresh 101" || a.Report.Total != 3 {
		t.Fatalf("snapshots or report incomplete: %+v err=%v", vs, err)
	}
}

func TestDetailFailuresDoNotStopOtherVacanciesAndCanResume(t *testing.T) {
	store := isolatedStore(t)
	ctx := context.Background()
	saveJob(t, store, core.Analysis{ID: "current", Expression: "Go"})
	if err := store.PutVacancy(ctx, "current", core.Vacancy{ID: "201", Title: "Old incomplete snapshot", Loaded: true}, false); err != nil {
		t.Fatal(err)
	}
	var mu sync.Mutex
	calls := map[string]int{}
	recovered := false
	runner := testRunner(t, func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		var args map[string]string
		_ = json.NewDecoder(r.Body).Decode(&args)
		id := args["vacancyId"]
		calls[r.URL.Path+id]++
		var data any = searchFixture(3, 3, false, "201", "202", "203")
		if r.URL.Path == "/vacancy" {
			if id == "202" && !recovered {
				_ = json.NewEncoder(w).Encode(map[string]any{"ok": false, "class": "input", "reason": "removed"})
				return
			}
			detail := Detail{Title: "Title", Description: "Description"}
			if id == "201" && !recovered {
				detail.Description = ""
			}
			data = detail
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "data": data})
	})
	jobs := NewJobs(store, runner)
	jobs.run(ctx, "current")
	a, err := store.Get(ctx, "current")
	if err != nil || a.Status != "partial" || a.Processed != 1 || a.Failed != 2 || a.Collected != 3 || !a.SearchDone {
		t.Fatalf("failed details were hidden: %+v err=%v", a, err)
	}
	vs, err := store.Vacancies(ctx, "current")
	if err != nil || vs[0].Loaded || vs[0].Error == "" || vs[1].Loaded || !vs[2].Loaded {
		t.Fatalf("bad detail marked loaded or later detail skipped: %+v err=%v", vs, err)
	}
	mu.Lock()
	if calls["/vacancy201"] != 3 || calls["/vacancy202"] != 1 || calls["/vacancy203"] != 1 {
		t.Errorf("unexpected attempts: %+v", calls)
	}
	recovered = true
	mu.Unlock()
	jobs.run(ctx, "current")
	a, err = store.Get(ctx, "current")
	if err != nil || a.Status != "completed" || a.Processed != 3 || a.Failed != 0 {
		t.Fatalf("resume failed: %+v err=%v", a, err)
	}
	mu.Lock()
	defer mu.Unlock()
	if calls["/search"] != 1 || calls["/vacancy203"] != 1 || calls["/vacancy201"] != 4 || calls["/vacancy202"] != 2 {
		t.Fatalf("resume fetched completed work or skipped failures: %+v", calls)
	}
}

func TestMissingCoverageRemainsResumableAfterThreePasses(t *testing.T) {
	store := isolatedStore(t)
	ctx := context.Background()
	saveJob(t, store, core.Analysis{ID: "current", Expression: "Go"})
	var mu sync.Mutex
	searches := 0
	runner := testRunner(t, func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		var args map[string]string
		_ = json.NewDecoder(r.Body).Decode(&args)
		var data any = Detail{Title: "Title", Description: "Description"}
		if r.URL.Path == "/search" {
			searches++
			if args["page"] == "0" {
				data = searchFixture(4, 2, true, "1", "2")
			} else {
				data = searchFixture(4, 2, false, "2", "3")
			}
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "data": data})
	})
	NewJobs(store, runner).run(ctx, "current")
	a, err := store.Get(ctx, "current")
	if err != nil || a.Status != "partial" || a.Processed != 3 || a.Collected != 3 || a.SearchDone || a.NextPage != 0 || a.Error == "" {
		t.Fatalf("missing coverage falsely completed: %+v err=%v", a, err)
	}
	mu.Lock()
	defer mu.Unlock()
	if searches != 6 {
		t.Fatalf("searches=%d want=6", searches)
	}
}

func TestSearchFailurePreservesCursorAndStillParsesCollectedLinks(t *testing.T) {
	store := isolatedStore(t)
	ctx := context.Background()
	saveJob(t, store, core.Analysis{ID: "current", Expression: "Go"})
	var mu sync.Mutex
	calls := map[string]int{}
	recovered := false
	runner := testRunner(t, func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		var args map[string]string
		_ = json.NewDecoder(r.Body).Decode(&args)
		calls[r.URL.Path+args["page"]+args["vacancyId"]]++
		var data any = Detail{Title: "Title", Description: "Description"}
		if r.URL.Path == "/search" {
			if args["page"] == "0" {
				data = searchFixture(2, 1, true, "301")
			} else if !recovered {
				data = searchFixture(2, 1, false)
			} else {
				data = searchFixture(2, 1, false, "302")
			}
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "data": data})
	})
	jobs := NewJobs(store, runner)
	jobs.run(ctx, "current")
	a, err := store.Get(ctx, "current")
	if err != nil || a.Status != "partial" || a.Processed != 1 || a.Collected != 1 || a.SearchDone || a.NextPage != 1 || a.Error == "" {
		t.Fatalf("failed search falsely completed or discarded details: %+v err=%v", a, err)
	}
	mu.Lock()
	if calls["/search1"] != 3 {
		t.Errorf("empty page was not retried: %+v", calls)
	}
	recovered = true
	mu.Unlock()
	jobs.run(ctx, "current")
	a, err = store.Get(ctx, "current")
	if err != nil || a.Status != "completed" || a.Processed != 2 || !a.SearchDone || a.Error != "" {
		t.Fatalf("search did not resume: %+v err=%v", a, err)
	}
	mu.Lock()
	defer mu.Unlock()
	if calls["/search0"] != 1 || calls["/vacancy301"] != 1 {
		t.Fatalf("resume repeated completed work: %+v", calls)
	}
}

func TestCollectionRechecksMissingLinksAcrossOverlappingPages(t *testing.T) {
	store := isolatedStore(t)
	ctx := context.Background()
	saveJob(t, store, core.Analysis{ID: "current", Expression: "Go"})
	var mu sync.Mutex
	calls := map[int]int{}
	runner := testRunner(t, func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		var args map[string]string
		_ = json.NewDecoder(r.Body).Decode(&args)
		var data any = Detail{Title: "Title", Description: "Description"}
		if r.URL.Path == "/search" {
			index, _ := strconv.Atoi(args["page"])
			calls[index]++
			if index == 0 {
				data = searchFixture(4, 2, true, "401", "402")
			} else if calls[index] == 1 {
				data = searchFixture(4, 2, false, "402", "403")
			} else {
				data = searchFixture(4, 2, false, "403", "404")
			}
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "data": data})
	})
	NewJobs(store, runner).run(ctx, "current")
	a, err := store.Get(ctx, "current")
	if err != nil || a.Status != "completed" || a.Processed != 4 || a.Collected != 4 || !a.SearchDone {
		t.Fatalf("missing links were not recovered: %+v err=%v", a, err)
	}
	mu.Lock()
	defer mu.Unlock()
	if calls[0] != 2 || calls[1] != 2 || len(calls) != 2 {
		t.Fatalf("unexpected reconciliation: %+v", calls)
	}
}

func TestIncompleteSearchKeepsAllValidLinksFromAttempts(t *testing.T) {
	store := isolatedStore(t)
	ctx := context.Background()
	saveJob(t, store, core.Analysis{ID: "current", Expression: "Go"})
	var mu sync.Mutex
	searches := 0
	runner := testRunner(t, func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		defer mu.Unlock()
		var data any = Detail{Title: "Title", Description: "Description"}
		if r.URL.Path == "/search" {
			searches++
			data = searchFixture(6, 6, false, strconv.Itoa(searches*2-1), strconv.Itoa(searches*2))
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "data": data})
	})
	NewJobs(store, runner).run(ctx, "current")
	a, err := store.Get(ctx, "current")
	if err != nil || a.Status != "partial" || a.Processed != 6 || a.Collected != 6 || a.Found != 6 || a.SearchDone || a.NextPage != 0 {
		t.Fatalf("valid links were lost after incomplete responses: %+v err=%v", a, err)
	}
}
