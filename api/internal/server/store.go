package server

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"hh-analytics/internal/core"
	"time"
)

type Store struct{ DB *pgxpool.Pool }

func NewStore(ctx context.Context, url string) (*Store, error) {
	db, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, err
	}
	if err = db.Ping(ctx); err != nil {
		db.Close()
		return nil, err
	}
	_, err = db.Exec(ctx, `CREATE TABLE IF NOT EXISTS analyses (
	 id text PRIMARY KEY, created_at timestamptz NOT NULL, document jsonb NOT NULL, deleted_at timestamptz
	); CREATE TABLE IF NOT EXISTS vacancies (
	 analysis_id text NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
	 id text NOT NULL, document jsonb NOT NULL, PRIMARY KEY(analysis_id,id)
	); ALTER TABLE analyses ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
	CREATE INDEX IF NOT EXISTS analyses_created ON analyses(created_at DESC);`)
	if err != nil {
		db.Close()
		return nil, err
	}
	return &Store{db}, nil
}
func (s *Store) Save(ctx context.Context, a *core.Analysis) error {
	a.UpdatedAt = time.Now().UTC()
	data, err := json.Marshal(a)
	if err != nil {
		return err
	}
	result, err := s.DB.Exec(ctx, `INSERT INTO analyses(id,created_at,document) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET document=excluded.document WHERE analyses.deleted_at IS NULL`, a.ID, a.CreatedAt, data)
	if err == nil && result.RowsAffected() == 0 {
		return ErrDeleted
	}
	return err
}
func (s *Store) Get(ctx context.Context, id string) (core.Analysis, error) {
	var data []byte
	var a core.Analysis
	err := s.DB.QueryRow(ctx, `SELECT document FROM analyses WHERE id=$1 AND deleted_at IS NULL`, id).Scan(&data)
	if err == nil {
		err = json.Unmarshal(data, &a)
	}
	return a, err
}
func (s *Store) List(ctx context.Context) ([]core.Analysis, error) {
	rows, err := s.DB.Query(ctx, `SELECT document - 'report' FROM analyses WHERE deleted_at IS NULL ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []core.Analysis{}
	for rows.Next() {
		var b []byte
		var a core.Analysis
		if err = rows.Scan(&b); err != nil {
			return nil, err
		}
		if err = json.Unmarshal(b, &a); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}
func (s *Store) PutVacancy(ctx context.Context, id string, v core.Vacancy, overwrite bool) error {
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	query := `INSERT INTO vacancies(analysis_id,id,document) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`
	if overwrite {
		query = `INSERT INTO vacancies(analysis_id,id,document) VALUES($1,$2,$3) ON CONFLICT(analysis_id,id) DO UPDATE SET document=excluded.document`
	}
	_, err = s.DB.Exec(ctx, query, id, v.ID, b)
	return err
}
func (s *Store) Vacancies(ctx context.Context, id string) ([]core.Vacancy, error) {
	rows, err := s.DB.Query(ctx, `SELECT document FROM vacancies WHERE analysis_id=$1 ORDER BY id`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []core.Vacancy{}
	for rows.Next() {
		var b []byte
		var v core.Vacancy
		if err = rows.Scan(&b); err != nil {
			return nil, err
		}
		if err = json.Unmarshal(b, &v); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}
func IsMissing(err error) bool { return errors.Is(err, pgx.ErrNoRows) }

var ErrDeleted = errors.New("анализ удалён")

func (s *Store) SetDeleted(ctx context.Context, ids []string, deleted bool) ([]string, error) {
	query := `UPDATE analyses SET deleted_at=now(), document=CASE
	 WHEN document->>'status' IN ('queued','running') THEN document || '{"status":"cancelled","stage":"done","message":"Сбор остановлен при удалении"}'::jsonb
	 ELSE document END
	 WHERE id=ANY($1::text[]) AND deleted_at IS NULL RETURNING id`
	if !deleted {
		query = `UPDATE analyses SET deleted_at=NULL WHERE id=ANY($1::text[]) AND deleted_at IS NOT NULL RETURNING id`
	}
	rows, err := s.DB.Query(ctx, query, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	changed := []string{}
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			return nil, err
		}
		changed = append(changed, id)
	}
	return changed, rows.Err()
}
