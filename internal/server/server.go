package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"

	"opslab-survey/internal/auth"
	"opslab-survey/internal/models"
	"opslab-survey/internal/seed"
	"opslab-survey/internal/store"
	"opslab-survey/web"
)

type Server struct {
	store         *store.Store
	authManager   *auth.Manager
	participants  []models.Participant
	participantBy map[string]models.Participant
	staticFS      http.Handler
}

type ctxKey string

const userCtxKey ctxKey = "user"

type sessionUser struct {
	Participant models.Participant
}

func New(store *store.Store, authManager *auth.Manager, participants []models.Participant) *Server {
	staticSub, err := fs.Sub(web.Static, "static")
	if err != nil {
		log.Fatal("failed to get static subdir:", err)
	}
	handler := http.FileServerFS(staticSub)
	participantBy := make(map[string]models.Participant)
	for _, p := range participants {
		participantBy[p.Code] = p
	}
	return &Server{
		store:         store,
		authManager:   authManager,
		participants:  participants,
		participantBy: participantBy,
		staticFS:      http.StripPrefix("/static/", handler),
	}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.Handle("/static/", s.cacheControl(s.staticFS))
	mux.HandleFunc("/api/login", s.handleLogin)
	mux.Handle("/api/logout", s.authenticated(s.handleLogout))
	mux.Handle("/api/me", s.authenticated(s.handleMe))
	mux.Handle("/api/questions", s.authenticated(s.handleQuestions))
	mux.Handle("/api/response", s.authenticated(s.handleResponse))

	// Admin
	mux.Handle("/api/admin/export", s.adminOnly(s.handleExport))
	mux.Handle("/api/admin/run-test", s.adminOnly(s.handleRunTestData))
	mux.Handle("/api/admin/reset", s.adminOnly(s.handleReset))

	// SPA fallback
	mux.HandleFunc("/", s.handleIndex)

	return s.logRequests(mux)
}

func (s *Server) handleIndex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.ServeFileFS(w, r, web.Static, "static/index.html")
		return
	}
	http.ServeFileFS(w, r, web.Static, "static/index.html")
}

func (s *Server) cacheControl(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "public, max-age=604800")
		next.ServeHTTP(w, r)
	})
}

func (s *Server) logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %v", r.Method, r.URL.Path, time.Since(start))
	})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var payload struct {
		Email string `json:"email"`
		Code  string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	payload.Email = strings.TrimSpace(strings.ToLower(payload.Email))
	payload.Code = strings.TrimSpace(payload.Code)
	p, err := s.store.ParticipantByEmailAndCode(r.Context(), payload.Email, payload.Code)
	if err != nil {
		http.Error(w, "неправильний код або email", http.StatusUnauthorized)
		return
	}
	token, err := s.authManager.Issue(p.Code, p.IsAdmin)
	if err != nil {
		http.Error(w, "cannot issue session", http.StatusInternalServerError)
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     "session",
		Value:    token,
		HttpOnly: true,
		Path:     "/",
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Now().Add(30 * 24 * time.Hour),
	})
	writeJSON(w, map[string]interface{}{
		"participant": p,
	})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     "session",
		Value:    "",
		HttpOnly: true,
		Path:     "/",
		SameSite: http.SameSiteLaxMode,
		Expires:  time.Now().Add(-1 * time.Hour),
	})
	writeJSON(w, map[string]string{"status": "ok"})
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(userCtxKey).(*sessionUser)
	writeJSON(w, map[string]interface{}{
		"participant": user.Participant,
	})
}

func (s *Server) handleQuestions(w http.ResponseWriter, r *http.Request) {
	user := r.Context().Value(userCtxKey).(*sessionUser)
	peers := s.peerListFor(user.Participant.Code)
	common := seed.CommonQuestions()
	peerQuestions := seed.BuildPeerQuestions(peers)
	payload := map[string]interface{}{
		"common":              common,
		"peer":                peerQuestions,
		"rankableParticipants": peers,
		"criteria": []string{
			"Власність та відповідальність",
			"Лідерство та вплив",
			"Розвиток бізнесу OPSLAB",
		},
	}
	writeJSON(w, payload)
}

func (s *Server) peerListFor(selfCode string) []models.Participant {
	var peers []models.Participant
	for _, p := range s.participants {
		if p.Code == selfCode || p.IsAdmin {
			continue
		}
		peers = append(peers, p)
	}
	sort.Slice(peers, func(i, j int) bool {
		return peers[i].Name < peers[j].Name
	})
	return peers
}

func (s *Server) handleResponse(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	user := r.Context().Value(userCtxKey).(*sessionUser)
	var payload struct {
		Answers  []models.AnswerPayload  `json:"answers"`
		Rankings []models.RankingPayload `json:"rankings"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if err := s.validateRankings(user.Participant.Code, payload.Rankings); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := s.store.UpsertResponse(r.Context(), user.Participant.Code, payload.Answers, payload.Rankings, false); err != nil {
		log.Println("save response:", err)
		http.Error(w, "cannot save", http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]string{"status": "saved"})
}

func (s *Server) validateRankings(selfCode string, rankings []models.RankingPayload) error {
	allowed := map[string]bool{}
	for _, p := range s.peerListFor(selfCode) {
		allowed[p.Code] = true
	}
	for _, r := range rankings {
		for _, c := range r.Order {
			if !allowed[c] {
				return fmt.Errorf("unknown participant in ranking: %s", c)
			}
		}
	}
	return nil
}

func (s *Server) handleExport(w http.ResponseWriter, r *http.Request) {
	responses, err := s.store.AllResponses(r.Context())
	if err != nil {
		log.Println("export:", err)
		http.Error(w, "cannot load export", http.StatusInternalServerError)
		return
	}
	payload := map[string]interface{}{
		"exportedAt":  time.Now(),
		"participants": s.participants,
		"responses":   responses,
	}
	writeJSON(w, payload)
}

func (s *Server) handleReset(w http.ResponseWriter, r *http.Request) {
	if err := s.store.ResetResponses(r.Context()); err != nil {
		log.Println("reset:", err)
		http.Error(w, "cannot reset", http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]string{"status": "cleared"})
}

func (s *Server) handleRunTestData(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	participants := s.participants
	peersByCode := map[string][]models.Participant{}
	for _, p := range participants {
		if p.IsAdmin {
			continue
		}
		peersByCode[p.Code] = s.peerListFor(p.Code)
	}

	for _, p := range participants {
		if p.IsAdmin {
			continue
		}
		answers := buildSyntheticAnswers(peersByCode[p.Code])
		rankings := buildSyntheticRankings(peersByCode[p.Code])
		if err := s.store.UpsertResponse(ctx, p.Code, answers, rankings, true); err != nil {
			log.Println("testdata for", p.Code, ":", err)
		}
	}
	writeJSON(w, map[string]string{"status": "test data loaded"})
}

func buildSyntheticAnswers(peers []models.Participant) []models.AnswerPayload {
	var ans []models.AnswerPayload
	for _, q := range seed.CommonQuestions() {
		switch q.Type {
		case "text":
			ans = append(ans, models.AnswerPayload{QuestionID: q.ID, Value: "Тестова відповідь: чіткі кордони потрібні у продажах та постаналітиці."})
		case "choice":
			ans = append(ans, models.AnswerPayload{QuestionID: q.ID, Value: q.Choice[0]})
		case "scale":
			ans = append(ans, models.AnswerPayload{QuestionID: q.ID, Value: 4})
		}
	}
	for _, pq := range seed.BuildPeerQuestions(peers) {
		switch pq.Type {
		case "text":
			ans = append(ans, models.AnswerPayload{QuestionID: pq.ID, Value: fmt.Sprintf("Тестово: %s тримає фокус.", pq.Title)})
		case "choice":
			ans = append(ans, models.AnswerPayload{QuestionID: pq.ID, Value: pq.Choice[1]})
		case "scale":
			ans = append(ans, models.AnswerPayload{QuestionID: pq.ID, Value: 5})
		}
	}
	return ans
}

func buildSyntheticRankings(peers []models.Participant) []models.RankingPayload {
	var codes []string
	for _, p := range peers {
		codes = append(codes, p.Code)
	}
	rankings := []models.RankingPayload{
		{
			Criteria: "Власність та відповідальність",
			Order:    codes,
			SelfRank: 2,
			Comment:  "Тестове ранжування для перевірки.",
		},
		{
			Criteria: "Лідерство та вплив",
			Order:    reverseStrings(codes),
			SelfRank: 3,
			Comment:  "Тестове ранжування для лідерства.",
		},
		{
			Criteria: "Розвиток бізнесу OPSLAB",
			Order:    codes,
			SelfRank: 4,
			Comment:  "Тестове ранжування для бізнесу.",
		},
	}
	return rankings
}

func reverseStrings(in []string) []string {
	out := make([]string, len(in))
	for i := range in {
		out[len(in)-1-i] = in[i]
	}
	return out
}

func (s *Server) authenticated(next http.HandlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, err := s.userFromRequest(r)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		ctx := context.WithValue(r.Context(), userCtxKey, user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (s *Server) adminOnly(next http.HandlerFunc) http.Handler {
	return s.authenticated(func(w http.ResponseWriter, r *http.Request) {
		user := r.Context().Value(userCtxKey).(*sessionUser)
		if !user.Participant.IsAdmin {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		next(w, r)
	})
}

func (s *Server) userFromRequest(r *http.Request) (*sessionUser, error) {
	cookie, err := r.Cookie("session")
	if err != nil {
		return nil, err
	}
	claims, err := s.authManager.Parse(cookie.Value)
	if err != nil {
		return nil, err
	}
	p, ok := s.participantBy[claims.Code]
	if !ok {
		return nil, errors.New("unknown participant")
	}
	return &sessionUser{Participant: p}, nil
}

func writeJSON(w http.ResponseWriter, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(payload)
}

// Start starts the HTTP server.
func Start() error {
	port := envOrDefault("PORT", "8080")
	dbURL := os.Getenv("DATABASE_URL")
	sessionSecret := os.Getenv("SESSION_SECRET")

	ctx := context.Background()
	st, err := store.New(ctx, dbURL)
	if err != nil {
		return err
	}
	defer st.Close()

	participants := seed.Participants()
	if err := st.EnsureSchema(ctx, participants); err != nil {
		return err
	}

	srv := New(st, auth.NewManager(sessionSecret), participants)
	server := &http.Server{
		Addr:         ":" + port,
		Handler:      srv.Routes(),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
	}

	log.Printf("listening on :%s", port)
	return server.ListenAndServe()
}

func envOrDefault(key, fallback string) string {
	val := os.Getenv(key)
	if val == "" {
		return fallback
	}
	return val
}
