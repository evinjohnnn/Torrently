// The measuring part of the speed test, ported from
// assets/src/js/app/speedtest.js: download a test file from each server,
// ignore the first megabyte (TCP slow start), report Mbps as it goes.

const SKIP_BYTES = 1 * 1024 * 1024;
const UPDATE_INTERVAL = 300; // ms between reports

export interface Progress {
  /** Mbps so far */
  speed: number;
  /** 0–100, when the server says how big the file is */
  percent: number;
}

export async function measure(url: string, onProgress: (p: Progress) => void, signal: AbortSignal): Promise<number> {
  const response = await fetch(url, { signal });
  if (!response.ok || !response.body) throw new Error("speedtest server error");

  const contentLength = parseInt(response.headers.get("content-length") || "0", 10);
  const reader = response.body.getReader();

  let totalBytes = 0;
  let measureStart: number | null = null;
  let measuredBytes = 0;
  let lastUpdate = 0;
  let speed = 0;
  let percent = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.length;
    if (contentLength > 0) percent = Math.round((totalBytes / contentLength) * 100);

    if (!measureStart && totalBytes >= SKIP_BYTES) {
      measureStart = performance.now();
      measuredBytes = 0;
    } else if (measureStart) {
      measuredBytes += value.length;
      const now = performance.now();
      if (now - lastUpdate >= UPDATE_INTERVAL) {
        const elapsed = (now - measureStart) / 1000;
        if (elapsed > 0) speed = (measuredBytes * 8) / (elapsed * 1_000_000);
        lastUpdate = now;
        onProgress({ speed, percent });
      }
    }
  }

  if (measureStart && measuredBytes > 0) {
    const elapsed = (performance.now() - measureStart) / 1000;
    speed = (measuredBytes * 8) / (elapsed * 1_000_000);
  }
  onProgress({ speed, percent: 100 });
  return speed;
}
