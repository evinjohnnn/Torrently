import { AppError } from "./errors.js";
export async function boundedJson<T>(
  response: globalThis.Response,
  limit = 1_000_000,
): Promise<T> {
  const reader = response.body?.getReader();
  if (!reader)
    throw new AppError(502, "INVALID_RESPONSE", "Empty engine response.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new AppError(
        502,
        "RESPONSE_LIMIT",
        "Engine response is too large.",
      );
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString()) as T;
  } catch {
    throw new AppError(
      502,
      "INVALID_RESPONSE",
      "Engine returned an invalid response.",
    );
  }
}
