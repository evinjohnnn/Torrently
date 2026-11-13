// Package spa serves the React app (frontend/) in place of the Go templates,
// one view at a time. A view that has a page registered here is answered with
// the app's shell and the page's data; every other view still renders from
// its template. See docs/react_ui.md.
package spa

import (
	"bytes"
	"encoding/json"
	"html/template"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	log "github.com/sirupsen/logrus"
	"github.com/urfave/cli"

	"github.com/webtor-io/web-ui/handlers/static"
	"github.com/webtor-io/web-ui/services/abuse_store"
	"github.com/webtor-io/web-ui/services/auth"
	"github.com/webtor-io/web-ui/services/common"
	"github.com/webtor-io/web-ui/services/embed"
	"github.com/webtor-io/web-ui/services/libapi"
	tpl "github.com/webtor-io/web-ui/services/template"
	"github.com/webtor-io/web-ui/services/turnstile"
	"github.com/webtor-io/web-ui/services/umami"
	"github.com/webtor-io/web-ui/services/web"
)

const (
	// ModeFlag picks the interface: "react" serves the React app for every
	// view that has a page, "classic" keeps the Go templates everywhere.
	ModeFlag = "web-ui"
	// PageHeader marks the app's own navigation: the same URL answers with
	// the page's JSON instead of a document.
	PageHeader = "X-Torrently-Page"
	// stateKey carries the serialised state from Serve to the shell template.
	stateKey = "spa.state"
	// overrideCookie lets one browser try the other interface (?ui=react).
	overrideCookie = "ui"
)

func RegisterFlags(f []cli.Flag) []cli.Flag {
	return append(f, cli.StringFlag{
		Name:   ModeFlag,
		Usage:  "interface to serve: react or classic",
		Value:  "classic",
		EnvVar: "WEB_UI",
	})
}

// Page builds the JSON a React page reads from the view's handler data
// (ctx.Data). A page that fails falls back to the template.
type Page func(ctx *web.Context) (any, error)

type Service struct {
	mode      string
	tm        *tpl.Manager[*web.Context]
	pages     map[string]Page
	fragments map[string]Page
	dist      string
	turnstile *turnstile.Helper
	umami     *umami.Helper
	useST     bool
	domain    string
	embed     bool
	apiDocs   string
	support   bool
	hashes    *static.AssetHashes

	mux        sync.Mutex
	manifest   map[string]manifestEntry
	manifestAt time.Time
}

func New(c *cli.Context, tm *tpl.Manager[*web.Context]) *Service {
	assets := c.String(static.AssetsPathFlag)
	if assets == "" {
		assets = "./assets/dist"
	}
	return &Service{
		mode:      c.String(ModeFlag),
		tm:        tm,
		pages:     map[string]Page{},
		fragments: map[string]Page{},
		dist:      filepath.Join(assets, "app"),
		turnstile: turnstile.NewHelper(c),
		umami:     umami.NewHelper(c),
		useST:     c.String(auth.SupertokensHostFlag) != "",
		domain:    c.String(common.DomainFlag),
		embed:     embed.Enabled(c),
		apiDocs:   libapi.PublicEndpoint(c) + "/docs/index.html",
		support:   c.Bool(abuse_store.UseFlag),
		hashes:    static.NewAssetHashes(assets),
	}
}

// Register makes the React app answer the view (e.g. "index", "resource/get").
func (s *Service) Register(view string, page Page) *Service {
	s.pages[view] = page
	return s
}

// RegisterFragment answers the app's own requests for a view rendered
// without a layout (an HTML fragment, e.g. "action/post" after a job starts)
// with the fragment's data as JSON. Everyone else still gets the fragment.
func (s *Service) RegisterFragment(view string, page Page) *Service {
	s.fragments[view] = page
	return s
}

// Has reports whether a view has a React page.
func (s *Service) Has(view string) bool {
	_, ok := s.pages[view]
	return ok
}

// State is what the app boots from, and what each in-app navigation returns.
type State struct {
	View    string  `json:"view"`
	Status  int     `json:"status"`
	Title   string  `json:"title,omitempty"`
	Error   *Error  `json:"error,omitempty"`
	Session Session `json:"session"`
	Data    any     `json:"data"`
}

type Error struct {
	Key  string       `json:"key"`
	Args *web.ErrArgs `json:"args,omitempty"`
}

func (s *Service) enabled(c *gin.Context) bool {
	if ui := c.Query(overrideCookie); ui == "react" || ui == "classic" {
		c.SetCookie(overrideCookie, ui, 60*60*24*365, "/", "", false, true)
		return ui == "react"
	}
	if ui, err := c.Cookie(overrideCookie); err == nil && (ui == "react" || ui == "classic") {
		return ui == "react"
	}
	return s.mode == "react"
}

// Serve implements template.Takeover: full pages of registered views are
// answered by the app; everything else (fragments, other layouts, other
// views) renders from the templates.
func (s *Service) Serve(view, layout string, code int, ctx *web.Context) bool {
	if layout == "" {
		return s.serveFragment(view, code, ctx)
	}
	if layout != "main" {
		return false
	}
	page, ok := s.pages[view]
	if !ok {
		return false
	}
	c := ctx.GetGinContext()
	if c.GetHeader("X-Requested-With") == "XMLHttpRequest" || !s.enabled(c) {
		return false
	}
	if _, err := s.entry(); err != nil {
		log.WithError(err).Warn("react app is not built, serving templates")
		return false
	}
	data, err := page(ctx)
	if err != nil {
		log.WithError(err).WithField("view", view).Error("failed to build page data, serving template")
		return false
	}
	state := State{
		View:    view,
		Status:  code,
		Session: s.session(ctx),
		Data:    data,
	}
	if ctx.ErrKey != "" {
		state.Error = &Error{Key: ctx.ErrKey, Args: ctx.ErrArgs}
	}
	c.Header("Vary", PageHeader)
	if c.GetHeader(PageHeader) != "" {
		state.Title = s.title(view, ctx)
		c.Header("Cache-Control", "no-store")
		c.JSON(code, state)
		return true
	}
	raw, err := json.Marshal(state)
	if err != nil {
		log.WithError(err).WithField("view", view).Error("failed to encode page state, serving template")
		return false
	}
	c.Set(stateKey, template.JS(raw))
	s.tm.Build(view).WithLayout("spa").HTML(code, ctx)
	return true
}

func (s *Service) serveFragment(view string, code int, ctx *web.Context) bool {
	page, ok := s.fragments[view]
	c := ctx.GetGinContext()
	if !ok || c.GetHeader(PageHeader) == "" {
		return false
	}
	data, err := page(ctx)
	if err != nil {
		log.WithError(err).WithField("view", view).Error("failed to build fragment data")
		return false
	}
	state := State{View: view, Status: code, Data: data, Session: s.session(ctx)}
	if ctx.ErrKey != "" {
		state.Error = &Error{Key: ctx.ErrKey, Args: ctx.ErrArgs}
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(code, state)
	return true
}

// title renders the view's own title block, so the app's document titles
// are the ones the templates and search engines already use.
func (s *Service) title(view string, ctx *web.Context) string {
	out, err := s.tm.Build(view).WithLayoutBody(`{{ template "title" . }}`).ToString(ctx)
	if err != nil {
		return ""
	}
	return string(bytes.TrimSpace([]byte(out))) + " | Torrently"
}

// Block renders one named block of a view's template (e.g. a legal page's
// text), for a page whose copy lives in its template and nowhere else.
func (s *Service) Block(view, block string, ctx *web.Context) (template.HTML, error) {
	out, err := s.tm.Build(view).WithLayoutBody(`{{ template "` + block + `" . }}`).ToString(ctx)
	if err != nil {
		return "", err
	}
	return template.HTML(bytes.TrimSpace([]byte(out))), nil
}

// legacyCSS is the classic interface's stylesheet, which the server-rendered
// cards the app still hosts (the player, the file info) are drawn with.
func (s *Service) legacyCSS() string {
	hash, err := s.hashes.Get("style.css")
	if err != nil {
		return "/assets/style.css"
	}
	return "/assets/style.css?" + hash
}

// ───────── shell helpers (registered on the template manager) ─────────

type Helper struct {
	s *Service
}

func NewHelper(s *Service) *Helper {
	return &Helper{s: s}
}

// SpaState is the JSON the shell embeds for the app to boot from.
func (h *Helper) SpaState(ctx *web.Context) template.JS {
	if v, ok := ctx.GetGinContext().Get(stateKey); ok {
		return v.(template.JS)
	}
	return "null"
}

// SpaAssets is the app's stylesheet and module script.
func (h *Helper) SpaAssets() template.HTML {
	e, err := h.s.entry()
	if err != nil {
		return ""
	}
	var b bytes.Buffer
	for _, css := range e.CSS {
		b.WriteString(`<link rel="stylesheet" href="/assets/app/` + template.HTMLEscapeString(css) + `">`)
	}
	b.WriteString(`<script type="module" src="/assets/app/` + template.HTMLEscapeString(e.File) + `"></script>`)
	return template.HTML(b.String())
}

// ───────── Vite manifest ─────────

type manifestEntry struct {
	File    string   `json:"file"`
	CSS     []string `json:"css"`
	IsEntry bool     `json:"isEntry"`
}

// entry finds the app's entry in the Vite manifest, re-read whenever the
// file changes: a rebuild replaces the hashed files the old one named.
func (s *Service) entry() (*manifestEntry, error) {
	s.mux.Lock()
	defer s.mux.Unlock()
	path := filepath.Join(s.dist, ".vite", "manifest.json")
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}
	if s.manifest == nil || !info.ModTime().Equal(s.manifestAt) {
		raw, err := os.ReadFile(path)
		if err != nil {
			return nil, err
		}
		m := map[string]manifestEntry{}
		if err := json.Unmarshal(raw, &m); err != nil {
			return nil, err
		}
		s.manifest = m
		s.manifestAt = info.ModTime()
	}
	for _, e := range s.manifest {
		if e.IsEntry {
			return &e, nil
		}
	}
	return nil, os.ErrNotExist
}
