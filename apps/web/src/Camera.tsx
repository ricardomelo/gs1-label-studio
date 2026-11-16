import type { Reading } from "@gs1-label-studio/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { cameraProblem, decodeImage, readingKey, readingsOf, RecentReadings, signalRead, trackControls, type CameraProblem, type TrackControls } from "./camera.ts";
import { en, t } from "./i18n.ts";

// The Check Studio's camera (backlog 7.1 g; the check studio's project, section 3.2): the rear camera's picture, a
// frame read every fifth of a second in the decoding worker, the first new symbols handed on. The stream stops when
// the studio hands on a reading (the result opens), when the tab is hidden and when the studio is left (unmounted).
// A torch and a zoom where the track offers them; a picture as the way round a refused or missing camera.

const PROBLEMS: Record<CameraProblem, string> = {
  refused: en("The camera was not allowed. Allow it in the browser's settings for this site, or take or choose a picture instead."),
  none: en("No camera was found on this device. Choose a picture, or type what the code holds."),
  busy: en("The camera is in use by another application. Close it and try again, or choose a picture."),
  insecure: en("This browser does not offer its camera to this page. Choose a picture, or type what the code holds."),
  other: en("The camera could not be started. Try again, or choose a picture."),
};

/** The longest side a camera frame is read at: enough for a code filling part of the picture, quick to decode. */
const FRAME_MAX_SIDE = 1280;
const FRAME_INTERVAL_MS = 200;

interface Props {
  /** False while a result is shown: the camera is then stopped. */
  active: boolean;
  /** Start without a press (the permission was already given). */
  autoStart: boolean;
  /** The new symbols of one frame. */
  onRead: (readings: Reading[]) => void;
  /** The way round a refused or missing camera: the picture button. */
  onPicture: () => void;
}

type State = { kind: "idle" } | { kind: "starting" } | { kind: "on" } | { kind: "problem"; problem: CameraProblem };

export function Camera({ active, autoStart, onRead, onPicture }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [wanted, setWanted] = useState(autoStart);
  const [controls, setControls] = useState<TrackControls>({ torch: false, zoom: null });
  const [torch, setTorch] = useState(false);
  const [zoom, setZoom] = useState<number | null>(null);
  const [hidden, setHidden] = useState(typeof document !== "undefined" && document.visibilityState === "hidden");
  const recent = useRef(new RecentReadings());
  const handOn = useRef(onRead);
  handOn.current = onRead;

  useEffect(() => {
    const visibility = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, []);

  const stop = useCallback(() => {
    for (const track of stream.current?.getTracks() ?? []) track.stop();
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);

  const running = wanted && active && !hidden;

  // The stream: started while wanted, active and visible; the cleanup stops it when any of these ends and when the
  // studio is left
  useEffect(() => {
    if (!running) {
      setState((s) => (s.kind === "problem" ? s : { kind: "idle" }));
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setState({ kind: "problem", problem: "insecure" });
      return;
    }
    let cancelled = false;
    setState({ kind: "starting" });
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then(async (media) => {
        if (cancelled) {
          for (const track of media.getTracks()) track.stop();
          return;
        }
        stream.current = media;
        const track = media.getVideoTracks()[0];
        const offered = trackControls(track?.getCapabilities?.() as Record<string, unknown> | undefined);
        setControls(offered);
        setTorch(false);
        setZoom(offered.zoom ? offered.zoom.min : null);
        if (video.current) {
          video.current.srcObject = media;
          await video.current.play().catch(() => undefined);
        }
        setState({ kind: "on" });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ kind: "problem", problem: cameraProblem(error) });
      });
    return () => {
      cancelled = true;
      stop();
    };
  }, [running, stop]);

  // The frames: one read at a time, every fifth of a second
  useEffect(() => {
    if (state.kind !== "on") return;
    let timer = 0;
    let done = false;
    const canvas = document.createElement("canvas");
    const tick = async () => {
      const v = video.current;
      if (done) return;
      if (v && v.readyState >= 2 && v.videoWidth > 0) {
        const scale = Math.min(1, FRAME_MAX_SIDE / Math.max(v.videoWidth, v.videoHeight));
        canvas.width = Math.round(v.videoWidth * scale);
        canvas.height = Math.round(v.videoHeight * scale);
        const context = canvas.getContext("2d", { willReadFrequently: true })!;
        context.drawImage(v, 0, 0, canvas.width, canvas.height);
        try {
          const size = { width: canvas.width, height: canvas.height };
          const symbols = await decodeImage(context.getImageData(0, 0, size.width, size.height), false);
          const now = Date.now();
          const fresh = readingsOf(symbols, "camera", size).filter((r) => recent.current.isNew(readingKey(r), now));
          if (!done && fresh.length) {
            signalRead();
            handOn.current(fresh);
          }
        } catch {
          // a frame the decoder could not take: the next one may do
        }
      }
      if (!done) timer = window.setTimeout(tick, FRAME_INTERVAL_MS);
    };
    timer = window.setTimeout(tick, FRAME_INTERVAL_MS);
    return () => {
      done = true;
      window.clearTimeout(timer);
    };
  }, [state.kind]);

  const track = () => stream.current?.getVideoTracks()[0];
  const applyTorch = (on: boolean) => {
    setTorch(on);
    void track()?.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] }).catch(() => setTorch(!on));
  };
  const applyZoom = (value: number) => {
    setZoom(value);
    void track()?.applyConstraints({ advanced: [{ zoom: value } as MediaTrackConstraintSet] }).catch(() => undefined);
  };

  return (
    <div className="camera" data-state={state.kind}>
      <div className="camera-view">
        <video ref={video} playsInline muted aria-label={t("The camera's picture")} hidden={state.kind !== "on" && state.kind !== "starting"} />
        {state.kind === "on" && <div className="camera-aim" aria-hidden="true" />}
        {state.kind === "idle" && (
          <div className="camera-placeholder">
            <p>{active ? t("Point the camera at a barcode: it reads by itself.") : t("The camera is paused while the result is shown.")}</p>
            {active && (
              <button type="button" className="btn primary" onClick={() => setWanted(true)}>
                {t("Start the camera")}
              </button>
            )}
          </div>
        )}
        {state.kind === "starting" && <p className="camera-placeholder">{t("Starting the camera…")}</p>}
        {state.kind === "problem" && (
          <div className="camera-placeholder" role="alert">
            <p>{t(PROBLEMS[state.problem])}</p>
            <div className="check-row">
              {state.problem !== "none" && state.problem !== "insecure" && (
                <button type="button" className="btn" onClick={() => { setWanted(false); setState({ kind: "idle" }); setTimeout(() => setWanted(true)); }}>
                  {t("Try again")}
                </button>
              )}
              <button type="button" className="btn primary" onClick={onPicture}>
                {t("Take or choose a picture")}
              </button>
            </div>
          </div>
        )}
      </div>
      {state.kind === "on" && (
        <div className="camera-controls">
          <p className="hint">{t("Point the camera at a barcode: it reads by itself.")}</p>
          {controls.torch && (
            <button type="button" className="btn" aria-pressed={torch} onClick={() => applyTorch(!torch)}>
              {t("Torch")}
            </button>
          )}
          {controls.zoom && zoom !== null && (
            <label className="field camera-zoom">
              <span>{t("Zoom")}</span>
              <input type="range" min={controls.zoom.min} max={controls.zoom.max} step={controls.zoom.step} value={zoom} onChange={(e) => applyZoom(Number(e.target.value))} />
            </label>
          )}
          <button type="button" className="btn" onClick={() => setWanted(false)}>
            {t("Stop the camera")}
          </button>
        </div>
      )}
    </div>
  );
}
