import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import {
  api,
  fileUrl,
  type Playback,
  type Progress,
  type Resource,
  type TorrentFile,
} from "./api";
import { Icon } from "./icons";

export function Player({
  resource,
  file,
  resume,
  onProgress,
  onClose,
}: {
  resource: Resource;
  file: TorrentFile;
  resume?: Progress | null;
  onProgress: (progress: Progress) => void;
  onClose: () => void;
}) {
  const media = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [mode, setMode] = useState<"direct" | "hls" | "transcode">("direct");
  const [attempt, setAttempt] = useState(0);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [error, setError] = useState("");
  const [state, setState] = useState("Preparing playback…");
  const [audioTracks, setAudioTracks] = useState<
    Array<{ id: number; name: string }>
  >([]);
  const [subtitleTracks, setSubtitleTracks] = useState<
    Array<{ id: number; name: string }>
  >([]);
  const [foundSubtitles, setFoundSubtitles] = useState<
    Array<{ url: string; label: string; language: string }>
  >([]);
  const [subtitleSearch, setSubtitleSearch] = useState("");
  const [findingSubtitles, setFindingSubtitles] = useState(false);
  const [caption, setCaption] = useState<{ url: string; label: string } | null>(
    null,
  );
  const [subtitleError, setSubtitleError] = useState("");
  const [offset, setOffset] = useState(0);
  const [position, setPosition] = useState(0);
  const [seekInput, setSeekInput] = useState<number | null>(null);
  const [seeking, setSeeking] = useState(false);
  const [reload, setReload] = useState(0);
  const seekOffset = useRef(0);
  const seekLock = useRef(false);
  const pendingTarget = useRef<number | null>(null);
  const resumeAfterSeek = useRef(false);
  const captionBase = useRef(
    new WeakMap<TextTrackCue, { start: number; end: number }>(),
  );
  const lastSave = useRef(0);
  const progressRef = useRef(onProgress);
  progressRef.current = onProgress;

  useEffect(() => {
    const cancel = new AbortController();
    setError("");
    setPlayback(null);
    setState("Preparing playback…");
    seekOffset.current = 0;
    pendingTarget.current = null;
    setPosition(0);
    api<Playback>(
      `${fileUrl(resource.id, file.id, "playback")}?mode=${mode}`,
      {},
      cancel.signal,
    )
      .then(setPlayback)
      .catch((e) => {
        if (!cancel.signal.aborted) {
          setError(e.message);
          setState("");
        }
      });
    return () => cancel.abort();
  }, [resource.id, file.id, mode, attempt]);

  useEffect(() => {
    const element = media.current;
    if (!element || !playback) return;
    let hls: Hls | undefined;
    setAudioTracks([]);
    setSubtitleTracks([]);
    if (
      playback.type === "hls" &&
      !element.canPlayType("application/vnd.apple.mpegurl")
    ) {
      if (!Hls.isSupported()) {
        setError(
          "This browser cannot play this HLS stream. Try Safari or a current Chromium browser.",
        );
        return;
      }
      hls = new Hls({ maxBufferLength: 30, maxMaxBufferLength: 60 });
      hlsRef.current = hls;
      hls.loadSource(playback.url);
      hls.attachMedia(element);
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_, data) =>
        setAudioTracks(
          data.audioTracks.map((track, i) => ({
            id: i,
            name: track.name || track.lang || `Track ${i + 1}`,
          })),
        ),
      );
      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_, data) =>
        setSubtitleTracks(
          data.subtitleTracks.map((track, i) => ({
            id: i,
            name: track.name || track.lang || `Subtitle ${i + 1}`,
          })),
        ),
      );
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          setError(
            "The stream stopped. Retry playback; torrent peers or the transcoder may be unavailable.",
          );
          setState("");
        }
      });
    } else {
      element.src = playback.url;
    }
    return () => {
      hls?.destroy();
      hlsRef.current = null;
      element.removeAttribute("src");
      element.load();
    };
  }, [playback, reload]);

  useEffect(() => {
    if (!playback) return;
    const ticket = playback.url.split("/").pop()!;
    const release = () => {
      void api(`/api/playback/${encodeURIComponent(ticket)}`, {
        method: "DELETE",
        keepalive: true,
      }).catch(() => {});
    };
    window.addEventListener("pagehide", release);
    return () => {
      window.removeEventListener("pagehide", release);
      release();
    };
  }, [playback]);

  useEffect(() => {
    if (
      playback?.session &&
      resume?.fileId === file.id &&
      resume.position > 0 &&
      resume.position < (playback.duration ?? 0) - 3
    )
      void seekTo(resume.position);
  }, [playback]);

  useEffect(
    () => () => {
      if (caption) URL.revokeObjectURL(caption.url);
    },
    [caption],
  );

  function save(force = false) {
    const element = media.current;
    const duration = playback?.session ? playback.duration : element?.duration;
    if (
      !element ||
      !duration ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      seekLock.current
    )
      return;
    if (force || Date.now() - lastSave.current > 10000) {
      lastSave.current = Date.now();
      progressRef.current({
        fileId: file.id,
        position:
          (playback?.session ? seekOffset.current : 0) + element.currentTime,
        duration,
      });
    }
  }
  async function seekTo(target: number) {
    if (!playback?.session || seekLock.current) return;
    seekLock.current = true;
    setSeeking(true);
    setError("");
    setState("Seeking through the server…");
    resumeAfterSeek.current = media.current ? !media.current.paused : false;
    const targetTime = Math.max(0, Math.min(playback.duration ?? 0, target));
    try {
      const ticket = playback.url.split("/").pop()!;
      const result = await api<{ offset?: number }>(
        `/api/playback/${encodeURIComponent(ticket)}/seek`,
        { method: "POST", body: JSON.stringify({ position: targetTime }) },
      );
      let nextOffset = result.offset;
      if (nextOffset === undefined || !Number.isFinite(nextOffset)) {
        const response = await fetch(playback.url, {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!response.ok)
          throw new Error(
            "The updated stream could not be loaded. Retry seeking.",
          );
        const text = await response.text();
        const match = text.match(/^#EXT-X-SESSION-OFFSET:([\d.]+)/m);
        if (!match)
          throw new Error(
            "The server did not provide the new stream position. Retry playback.",
          );
        nextOffset = Number(match[1]);
      }
      seekOffset.current = nextOffset;
      pendingTarget.current = Math.max(0, targetTime - nextOffset);
      setPosition(targetTime);
      setReload((value) => value + 1);
      applyCaptionTiming(offset);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Seeking failed. Please retry.",
      );
      setState("");
    } finally {
      seekLock.current = false;
      setSeeking(false);
      setSeekInput(null);
    }
  }
  function keyboard(event: React.KeyboardEvent<HTMLVideoElement>) {
    const element = media.current;
    if (!element) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const delta = event.key === "ArrowRight" ? 10 : -10;
      if (playback?.session)
        void seekTo(seekOffset.current + element.currentTime + delta);
      else
        element.currentTime = Math.max(
          0,
          Math.min(element.duration || 0, element.currentTime + delta),
        );
    }
    if (event.key.toLowerCase() === "f" && file.kind === "video") {
      event.preventDefault();
      if (!document.fullscreenElement)
        void element.requestFullscreen().catch(() => {});
      else void document.exitFullscreen().catch(() => {});
    }
  }
  async function uploadCaption(file?: File) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024 || !/\.(srt|vtt)$/i.test(file.name)) {
      setSubtitleError("Choose an SRT or VTT subtitle smaller than 2 MB.");
      return;
    }
    const text = (await file.text()).replace(/^\uFEFF/, "");
    const vtt = /\.srt$/i.test(file.name)
      ? `WEBVTT\n\n${text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")}`
      : text;
    if (!vtt.trimStart().startsWith("WEBVTT")) {
      setSubtitleError("This is not a valid WebVTT subtitle.");
      return;
    }
    setCaption({
      url: URL.createObjectURL(new Blob([vtt], { type: "text/vtt" })),
      label: file.name,
    });
    setOffset(0);
    setSubtitleError("");
  }
  function shiftSubtitles(next: number) {
    applyCaptionTiming(next);
    setOffset(next);
  }
  function applyCaptionTiming(delay: number) {
    const tracks =
      media.current?.querySelectorAll<HTMLTrackElement>("track") ?? [];
    for (const track of Array.from(tracks))
      for (const cue of Array.from(track.track.cues ?? [])) {
        let base = captionBase.current.get(cue);
        if (!base) {
          base = { start: cue.startTime, end: cue.endTime };
          captionBase.current.set(cue, base);
        }
        const shift = delay - (playback?.session ? seekOffset.current : 0);
        cue.startTime = base.start + shift;
        cue.endTime = base.end + shift;
      }
  }
  async function findSubtitles() {
    setFindingSubtitles(true);
    setSubtitleSearch("");
    try {
      const result = await api<{
        tracks: Array<{ url: string; label: string; language: string }>;
        pending: boolean;
        configured: boolean;
      }>(fileUrl(resource.id, file.id, "subtitles"));
      setFoundSubtitles(result.tracks);
      if (!result.configured)
        setSubtitleSearch("OpenSubtitles is not configured on this server.");
      else if (result.pending)
        setSubtitleSearch(
          "The server is searching for subtitles. Try again shortly.",
        );
      else
        setSubtitleSearch(
          result.tracks.length
            ? `${result.tracks.length} subtitle ${result.tracks.length === 1 ? "track" : "tracks"} added. Select a language from the player’s subtitle menu.`
            : "No external subtitles were found for this file. You can upload an SRT or VTT file.",
        );
    } catch (e) {
      setSubtitleSearch(
        e instanceof Error
          ? e.message
          : "Subtitle search failed. Please retry.",
      );
    } finally {
      setFindingSubtitles(false);
    }
  }
  return (
    <section className="player-panel" aria-label="Media player">
      <div className="player-heading">
        <div>
          <span className="eyebrow">NOW PLAYING</span>
          <h2>{file.name}</h2>
        </div>
        <button
          className="icon-button"
          onClick={() => {
            save(true);
            onClose();
          }}
          aria-label="Close player"
        >
          <Icon name="close" />
        </button>
      </div>
      <video
        key={file.id}
        ref={media}
        className={file.kind === "audio" ? "media audio-media" : "media"}
        controls
        playsInline
        preload="metadata"
        tabIndex={0}
        onKeyDown={keyboard}
        onWaiting={() => setState("Buffering from torrent peers…")}
        onPlaying={() => setState("")}
        onCanPlay={() => setState("Ready to play")}
        onTimeUpdate={() => {
          const el = media.current;
          if (el)
            setPosition(
              (playback?.session ? seekOffset.current : 0) + el.currentTime,
            );
          save();
        }}
        onPause={() => save(true)}
        onEnded={() => save(true)}
        onError={() => {
          setError(
            "This file could not be played. Try another playback mode, or download the original file.",
          );
          setState("");
        }}
        onLoadedMetadata={() => {
          const el = media.current;
          if (el && pendingTarget.current !== null) {
            el.currentTime = pendingTarget.current;
            pendingTarget.current = null;
            if (resumeAfterSeek.current) void el.play().catch(() => {});
          } else if (
            el &&
            !playback?.session &&
            resume?.fileId === file.id &&
            resume.position < el.duration - 3
          )
            el.currentTime = resume.position;
          setState("Ready to play");
        }}
      >
        {playback?.subtitles?.map((subtitle, i) => (
          <track
            key={subtitle.url}
            kind="subtitles"
            src={subtitle.url}
            label={subtitle.label}
            srcLang={subtitle.language || `und-${i}`}
            onLoad={() => applyCaptionTiming(offset)}
          />
        ))}
        {foundSubtitles
          .filter(
            (subtitle) =>
              !playback?.subtitles?.some(
                (existing) => existing.url === subtitle.url,
              ),
          )
          .map((subtitle) => (
            <track
              key={subtitle.url}
              kind="subtitles"
              src={subtitle.url}
              label={subtitle.label}
              srcLang={subtitle.language || "und"}
              onLoad={() => applyCaptionTiming(offset)}
            />
          ))}
        {caption && (
          <track
            key={caption.url}
            data-uploaded="true"
            kind="subtitles"
            src={caption.url}
            label={caption.label}
            srcLang="und"
            default
            onLoad={() => applyCaptionTiming(offset)}
          />
        )}
        Your browser does not support HTML5 media playback.
      </video>
      {playback?.session &&
        playback.duration !== undefined &&
        playback.duration > 0 && (
          <div className="session-seek">
            <label htmlFor="full-timeline">
              Full file timeline{" "}
              <span>
                {formatTime(seekInput ?? position)} /{" "}
                {formatTime(playback.duration)}
              </span>
            </label>
            <input
              id="full-timeline"
              aria-label="Seek through full file"
              type="range"
              min="0"
              max={playback.duration}
              step="1"
              value={seekInput ?? position}
              disabled={seeking}
              onChange={(e) => setSeekInput(Number(e.target.value))}
              onPointerUp={(e) => void seekTo(Number(e.currentTarget.value))}
              onKeyUp={(e) => {
                if (
                  [
                    "ArrowLeft",
                    "ArrowRight",
                    "Home",
                    "End",
                    "PageUp",
                    "PageDown",
                  ].includes(e.key)
                )
                  void seekTo(Number(e.currentTarget.value));
              }}
            />
          </div>
        )}
      <div className="player-status" aria-live="polite">
        {error ? <span className="error-text">{error}</span> : state}
      </div>
      <div className="player-tools">
        <label>
          Playback
          <select
            aria-label="Playback mode"
            value={mode}
            onChange={(e) =>
              setMode(e.target.value as "direct" | "hls" | "transcode")
            }
          >
            <option value="direct">Original file</option>
            <option value="hls">HLS without conversion</option>
            <option value="transcode">Convert for browser</option>
          </select>
        </label>
        <label>
          Speed
          <select
            aria-label="Playback speed"
            defaultValue="1"
            onChange={(e) => {
              if (media.current)
                media.current.playbackRate = Number(e.target.value);
            }}
          >
            {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
              <option key={speed} value={speed}>
                {speed}×
              </option>
            ))}
          </select>
        </label>
        {audioTracks.length > 1 && (
          <label>
            Audio
            <select
              aria-label="Audio track"
              onChange={(e) => {
                if (hlsRef.current)
                  hlsRef.current.audioTrack = Number(e.target.value);
              }}
            >
              {audioTracks.map((track) => (
                <option value={track.id} key={track.id}>
                  {track.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {subtitleTracks.length > 0 && (
          <label>
            Embedded subtitles
            <select
              aria-label="Embedded subtitle track"
              defaultValue="-1"
              onChange={(e) => {
                if (hlsRef.current)
                  hlsRef.current.subtitleTrack = Number(e.target.value);
              }}
            >
              <option value="-1">Off</option>
              {subtitleTracks.map((track) => (
                <option value={track.id} key={track.id}>
                  {track.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="button quiet upload-caption">
          <Icon name="plus" size={16} />
          Subtitles
          <input
            type="file"
            accept=".vtt,.srt"
            onChange={(e) => void uploadCaption(e.target.files?.[0])}
          />
        </label>
        {file.kind === "video" && (
          <button
            className="button quiet"
            disabled={findingSubtitles}
            onClick={() => void findSubtitles()}
          >
            {findingSubtitles ? "Finding subtitles…" : "Find subtitles"}
          </button>
        )}
        {(caption ||
          foundSubtitles.length > 0 ||
          (playback?.subtitles?.length ?? 0) > 0) && (
          <label>
            Subtitle delay
            <select
              aria-label="Subtitle delay"
              value={offset}
              onChange={(e) => shiftSubtitles(Number(e.target.value))}
            >
              {[-5, -2, -1, 0, 1, 2, 5].map((value) => (
                <option key={value} value={value}>
                  {value > 0 ? "+" : ""}
                  {value}s
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          className="button quiet"
          onClick={() => setAttempt((value) => value + 1)}
        >
          Retry
        </button>
        <a
          className="button quiet"
          href={fileUrl(resource.id, file.id)}
          download
        >
          <Icon name="download" size={16} />
          Original
        </a>
      </div>
      {subtitleError && (
        <p className="error-text" role="alert">
          {subtitleError}
        </p>
      )}
      {subtitleSearch && (
        <p className="fine-print" role="status">
          {subtitleSearch}
        </p>
      )}
      <p className="fine-print">
        Original playback depends on your browser’s codecs. Conversion uses
        server CPU and starts only when selected. Uploaded subtitles stay in
        this browser session.
      </p>
    </section>
  );
}

function formatTime(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 3600) > 0 ? `${Math.floor(whole / 3600)}:` : ""}${String(Math.floor(whole / 60) % 60).padStart(2, "0")}:${String(whole % 60).padStart(2, "0")}`;
}
