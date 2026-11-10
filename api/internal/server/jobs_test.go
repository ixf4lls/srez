package server

import "testing"

func TestSearchPageCompleteness(t *testing.T) {
	no, yes := false, true
	one := 1
	items := []SearchItem{{URL: "https://hh.ru/vacancy/1"}, {URL: "https://hh.ru/vacancy/2"}}
	for _, tc := range []struct {
		name  string
		page  SearchResult
		index int
		seen  map[string]bool
		valid bool
	}{
		{"full page", SearchResult{Items: items, Total: 3, PageSize: 2, HasMore: &yes}, 0, nil, true},
		{"last page", SearchResult{Items: items[:1], Total: 3, PageSize: 2, HasMore: &no}, 1, nil, true},
		{"confirmed zero", SearchResult{TotalKnown: true}, 0, nil, true},
		{"unknown empty", SearchResult{}, 0, nil, false},
		{"unexpected empty", SearchResult{Total: 3, HasMore: &no}, 0, nil, false},
		{"short page", SearchResult{Items: items[:1], Total: 3, PageSize: 2}, 0, nil, false},
		{"wrong page", SearchResult{Items: items, CurrentPage: &one}, 0, nil, false},
		{"repeated page", SearchResult{Items: []SearchItem{items[1], items[0]}}, 1, map[string]bool{"1,2": true}, false},
		{"unrelated host", SearchResult{Items: []SearchItem{{URL: "https://example.org/vacancy/1"}}}, 0, nil, false},
		{"duplicate links hide missing row", SearchResult{Items: []SearchItem{items[0], items[0]}, Total: 3, PageSize: 2}, 0, nil, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			err := validateSearchPage(tc.page, tc.index, tc.seen)
			if (err == nil) != tc.valid {
				t.Fatalf("valid=%v err=%v", tc.valid, err)
			}
		})
	}
	if !searchHasMore(SearchResult{Items: items, HasMore: &no, Total: 3, PageSize: 2}, 0) {
		t.Fatal("disabled next must not hide pages required by the total")
	}
}
