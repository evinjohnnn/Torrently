package spa

import (
	"time"

	"github.com/webtor-io/web-ui/handlers/library"
	"github.com/webtor-io/web-ui/handlers/library/helpers"
	"github.com/webtor-io/web-ui/handlers/library/shared"
	"github.com/webtor-io/web-ui/models"
	"github.com/webtor-io/web-ui/services/web"
)

func init() { page("library/index", (*config).library) }

// Library is the library page ("library/index"): one section of the
// signed-in user's collection, sorted and filtered as the query asked.
type Library struct {
	Section string       `json:"section"` // torrents | movies | series
	Sort    int          `json:"sort"`
	Sorts   []SortOption `json:"sorts"`
	// Watched is the movies and series filter: "" | unwatched | watched.
	Watched  string           `json:"watched"`
	Counts   LibraryCounts    `json:"counts"`
	Torrents []LibraryTorrent `json:"torrents"`
	Videos   []LibraryVideo   `json:"videos"`
	// Rate is the rating dialog the page was asked to open: after a title
	// was marked watched (handlers/user_video_status), or ?rate-form=true.
	Rate *LibraryRate `json:"rate,omitempty"`
}

type SortOption struct {
	Value int    `json:"value"`
	Title string `json:"title"`
}

type LibraryCounts struct {
	Torrents int `json:"torrents"`
	Movies   int `json:"movies"`
	Series   int `json:"series"`
}

type LibraryTorrent struct {
	ResourceID string    `json:"resourceId"`
	Name       string    `json:"name"`
	Size       int64     `json:"size"`
	Files      int       `json:"files"`
	AddedAt    time.Time `json:"addedAt"`
}

// LibraryVideo is a movie or a series. VideoID is empty for a title that
// was never matched: it has no watched state and cannot be rated.
type LibraryVideo struct {
	ResourceID string  `json:"resourceId"`
	VideoID    string  `json:"videoId,omitempty"`
	Type       string  `json:"type"` // movie | series
	Title      string  `json:"title"`
	Year       int     `json:"year,omitempty"`
	Rating     float64 `json:"rating,omitempty"`
	Poster     string  `json:"poster"`
	AdultBadge bool    `json:"adultBadge"`
	Watched    bool    `json:"watched"`
	UserRating int     `json:"userRating,omitempty"`
}

type LibraryRate struct {
	VideoID string `json:"videoId"`
	Type    string `json:"type"`
	Current int    `json:"current"`
}

func (cfg *config) library(ctx *web.Context) (any, error) {
	d, ok := ctx.Data.(*library.IndexData)
	if !ok || d == nil || d.Args == nil {
		return nil, errNoData
	}
	out := &Library{
		Section:  string(d.Args.Section),
		Sort:     int(d.Args.Sort),
		Sorts:    []SortOption{},
		Watched:  string(d.Args.Watched),
		Counts:   LibraryCounts{Torrents: d.TorrentCount, Movies: d.MovieCount, Series: d.SeriesCount},
		Torrents: []LibraryTorrent{},
		Videos:   []LibraryVideo{},
	}
	if s := helpers.NewSortHelper().MakeSort(d.Args); s != nil {
		for _, o := range *s {
			out.Sorts = append(out.Sorts, SortOption{Value: o.Value, Title: o.Title})
		}
	}
	vh := helpers.NewVideoContentHelper()
	for _, it := range d.Items {
		switch v := it.(type) {
		case *models.Library:
			t := LibraryTorrent{ResourceID: v.ResourceID, Name: v.Name, AddedAt: v.CreatedAt}
			if v.Torrent != nil {
				t.Name, t.Size, t.Files = v.Torrent.Name, v.Torrent.SizeBytes, v.Torrent.FileCount
			}
			out.Torrents = append(out.Torrents, t)
		case *models.Movie:
			out.Videos = append(out.Videos, videoOf(ctx, vh, v, v.IsAdult(), v.UserWatched, v.UserRating))
		case *models.Series:
			out.Videos = append(out.Videos, videoOf(ctx, vh, v, v.IsAdult(), v.UserWatched, v.UserRating))
		}
	}
	if rf := d.RateForm; rf != nil && d.Args.Section != shared.SectionTypeTorrents {
		out.Rate = &LibraryRate{VideoID: rf.VideoID, Type: rf.Type, Current: rf.CurrentRating}
	}
	return out, nil
}

func videoOf(ctx *web.Context, vh *helpers.VideoContentHelper, m models.VideoContentWithMetadata, adult, watched bool, rating *int16) LibraryVideo {
	v := LibraryVideo{
		VideoID:    vh.GetVideoID(m),
		Type:       vh.GetVideoType(m),
		Title:      vh.GetTitle(m),
		Year:       vh.GetYear(m),
		Rating:     vh.GetRating(m),
		Poster:     vh.GetCachedPoster240(m, ctx),
		AdultBadge: web.ShowAdultBadge(adult, ctx),
		Watched:    watched,
	}
	if c := m.GetContent(); c != nil {
		v.ResourceID = c.ResourceID
	}
	if rating != nil {
		v.UserRating = int(*rating)
	}
	return v
}
