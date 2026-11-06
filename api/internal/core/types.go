package core

import "time"

type Filters map[string]string

type Analysis struct {
	ID           string     `json:"id"`
	Title        string     `json:"title"`
	Query        string     `json:"query"`
	ExcludeWords string     `json:"excludeWords,omitempty"`
	Expression   string     `json:"expression"`
	Mode         string     `json:"mode"`
	Filters      Filters    `json:"filters"`
	FilterLabels Filters    `json:"filterLabels"`
	Status       string     `json:"status"`
	Stage        string     `json:"stage"`
	Message      string     `json:"message"`
	CreatedAt    time.Time  `json:"createdAt"`
	UpdatedAt    time.Time  `json:"updatedAt"`
	CompletedAt  *time.Time `json:"completedAt,omitempty"`
	Found        int        `json:"found"`
	Collected    int        `json:"collected"`
	Skipped      int        `json:"skipped"`
	Processed    int        `json:"processed"`
	Failed       int        `json:"failed"`
	NextPage     int        `json:"nextPage"`
	SearchDone   bool       `json:"searchDone"`
	Warnings     []string   `json:"warnings"`
	Error        string     `json:"error,omitempty"`
	Report       *Report    `json:"report,omitempty"`
}

type Vacancy struct {
	ID             string        `json:"id"`
	URL            string        `json:"url"`
	Title          string        `json:"title"`
	Company        string        `json:"company"`
	Salary         string        `json:"salary"`
	City           string        `json:"city"`
	Address        string        `json:"address"`
	Experience     string        `json:"experience"`
	WorkFormats    []string      `json:"workFormats"`
	Format         string        `json:"format"`
	EmploymentForm string        `json:"employmentForm"`
	Grade          string        `json:"grade"`
	Employment     string        `json:"employment"`
	WorkSchedule   string        `json:"workSchedule"`
	WorkingHours   string        `json:"workingHours"`
	Description    string        `json:"description"`
	KeySkills      []string      `json:"keySkills"`
	ResponseCount  *int          `json:"responseCount"`
	PublishedAt    string        `json:"publishedAt"`
	CollectedAt    time.Time     `json:"collectedAt"`
	Loaded         bool          `json:"loaded"`
	Error          string        `json:"error,omitempty"`
	Requirements   []Requirement `json:"requirements"`
}

type Requirement struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	Kind  string `json:"kind"`
	Quote string `json:"quote"`
}

type Evidence struct {
	VacancyID string `json:"vacancyId"`
	Field     string `json:"field"`
	Quote     string `json:"quote"`
}

type Metric struct {
	Key        string     `json:"key"`
	Label      string     `json:"label"`
	Kind       string     `json:"kind,omitempty"`
	Count      int        `json:"count"`
	Percent    float64    `json:"percent"`
	VacancyIDs []string   `json:"vacancyIds"`
	Evidence   []Evidence `json:"evidence"`
}

type ResponsePoint struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	Count int    `json:"count"`
}

type Report struct {
	Total                int                 `json:"total"`
	Dimensions           map[string][]Metric `json:"dimensions"`
	Skills               []Metric            `json:"skills"`
	Requirements         []Metric            `json:"requirements"`
	Responses            []ResponsePoint     `json:"responses"`
	ResponseMean         *float64            `json:"responseMean"`
	ResponseCoverage     int                 `json:"responseCoverage"`
	SkillsCoverage       int                 `json:"skillsCoverage"`
	RequirementsCoverage int                 `json:"requirementsCoverage"`
	Version              string              `json:"version"`
}
