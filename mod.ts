// Official SDK for emaki (emaki.ai), the Japanese-language AI video generator for Seedance 2.5 and Seedance 2.0. See README.md.

/** The service this module talks to. */
export const BASE_URL = "https://emaki.ai";
/** Where users create API keys. */
export const KEYS_URL = `${BASE_URL}/settings/apikeys`;

/** Video model ids. `seedance_2_5` is the default. */
export const VIDEO_MODELS = [
  "seedance_2_5", "seedance_2", "seedance_2_fast", "seedance_2_mini", "minimax_h3", "veo_3_1",
] as const;
/** Image model ids. `nano_banana_2_lite` is the default and the cheapest. */
export const IMAGE_MODELS = ["nano_banana_2_lite", "nano_banana_2", "seedream_5_lite", "gpt_image_2"] as const;

export const DEFAULT_VIDEO_MODEL = "seedance_2_5";
export const DEFAULT_IMAGE_MODEL = "nano_banana_2_lite";

/**
 * What went wrong, so callers can decide what to do next.
 * auth: no or bad key · quota: out of credits · plan: model needs a purchase ·
 * busy: another run is generating · rejected: content filter or cooldown, reword ·
 * failed: the run was accepted but failed (`code` is the failureCode) · timeout · other
 */
export type ErrorKind = "auth" | "quota" | "plan" | "busy" | "rejected" | "failed" | "timeout" | "other";

/** Every failure is an EmakiError; branch on `kind`. */
export class EmakiError extends Error {
  constructor(
    message: string,
    readonly kind: ErrorKind = "other",
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "EmakiError";
  }
}

/** Model parameters, sent as they are, e.g. `{ duration: 5, resolution: "720p", aspect_ratio: "9:16", image: "https://…" }`. */
export type Parameters = Record<string, unknown>;

/** Connection options shared by every call. */
export interface ClientOptions {
  /** Defaults to the `EMAKI_API_KEY` environment variable. */
  apiKey?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

/** Options for calls that wait for the result. */
export interface WaitOptions extends ClientOptions {
  /** Milliseconds. Default 15 minutes. */
  timeout?: number;
  /** Milliseconds between polls. Default 5 seconds. */
  pollEvery?: number;
}

/** Options for generateVideo / generateImage. */
export interface GenerateOptions extends WaitOptions {
  model?: string;
  parameters?: Parameters;
}

/** The run record returned by `status`. */
export interface RunStatus {
  id: string;
  status: "generating" | "completed" | "failed" | string;
  /** The result URL, images included. */
  videoUrl?: string | null;
  failureCode?: string | null;
  [k: string]: unknown;
}

function envKey(): string | undefined {
  // deno-lint-ignore no-explicit-any
  const g = globalThis as any;
  try {
    return g.process?.env?.EMAKI_API_KEY ?? g.Deno?.env?.get("EMAKI_API_KEY");
  } catch {
    return undefined; // Deno without --allow-env
  }
}

/** Map an HTTP error response to the error that says what to do next. */
export function errorFor(status: number, body: { error?: string; message?: string; code?: unknown }): EmakiError {
  const msg = String(body.error ?? body.message ?? `HTTP ${status}`);
  const code = typeof body.code === "string" ? body.code : undefined;
  const kind: ErrorKind = status === 401 ? "auth"
    : status === 402 ? "quota"
    : status === 403 ? "plan"
    : status === 409 ? "busy"
    : code === "content_cooldown" || code === "content_blocked" ? "rejected"
    : "other";
  return new EmakiError(msg, kind, status, code);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// deno-lint-ignore no-explicit-any
async function post(path: string, body: unknown, o: ClientOptions): Promise<{ status: number; json: any }> {
  const key = o.apiKey || envKey();
  if (!key) throw new EmakiError(`pass apiKey or set EMAKI_API_KEY; create a key at ${KEYS_URL}`, "auth");
  const res = await (o.fetch ?? fetch)((o.baseUrl ?? BASE_URL) + path, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(body ?? {}),
  });
  let json = {};
  try {
    json = await res.json();
  } catch {
    // non-JSON error page; status code still tells what happened
  }
  return { status: res.status, json };
}

/** Start one run and resolve to its id without waiting. */
export async function submit(prompt: string, model: string = DEFAULT_VIDEO_MODEL, parameters: Parameters = {}, o: ClientOptions = {}): Promise<string> {
  if (!prompt?.trim()) throw new TypeError("prompt is required");
  const params = Object.fromEntries(Object.entries(parameters).filter(([, v]) => v !== undefined && v !== null));
  const r = await post("/api/video/ai", { prompt, model, parameters: params }, o);
  if (r.status !== 200 || !r.json?.success) throw errorFor(r.status, r.json ?? {});
  const id = r.json.data?.id;
  if (!id) throw new EmakiError("the service returned no id", "other", r.status);
  return String(id);
}

/** Fetch the run record: `status` is generating, completed or failed; `videoUrl` holds the result. */
export async function status(videoId: string, o: ClientOptions = {}): Promise<RunStatus> {
  const r = await post("/api/video/status", { videoId }, o);
  if (r.status !== 200 || !r.json?.success) throw errorFor(r.status, r.json ?? {});
  return r.json.data as RunStatus;
}

/** Poll a run until it finishes and resolve to the result URL. */
export async function wait(videoId: string, o: WaitOptions = {}): Promise<string> {
  const deadline = Date.now() + (o.timeout ?? 900_000);
  while (true) {
    let d: RunStatus | undefined;
    try {
      d = await status(videoId, o);
    } catch (e) {
      if (e instanceof EmakiError) throw e;
      // a dropped poll is not a failed generation
    }
    if (d?.status === "completed" && d.videoUrl) return String(d.videoUrl);
    if (d?.status === "failed") {
      const fc = d.failureCode ?? undefined;
      throw new EmakiError(`the run failed (${fc ?? "no failure code"})`, "failed", undefined, fc);
    }
    if (Date.now() >= deadline) {
      throw new EmakiError(`deadline passed; run ${videoId} may still finish in your emaki library`, "timeout");
    }
    await sleep(o.pollEvery ?? 5_000);
  }
}

/** Generate one clip and resolve to its URL. Put `image` (an https URL) in `parameters` to use it as the first frame. */
export async function generateVideo(prompt: string, o: GenerateOptions = {}): Promise<string> {
  const id = await submit(prompt, o.model ?? DEFAULT_VIDEO_MODEL, o.parameters ?? {}, o);
  return wait(id, o);
}

/** Generate one image and resolve to its URL. */
export function generateImage(prompt: string, o: GenerateOptions = {}): Promise<string> {
  return generateVideo(prompt, { ...o, model: o.model ?? DEFAULT_IMAGE_MODEL });
}

/** Resolve to the remaining credits on the account. Free to call. */
export async function credits(o: ClientOptions = {}): Promise<number> {
  const r = await post("/api/user/get-user-credits", {}, o);
  if (r.status === 200 && r.json?.code === 0) return Number(r.json.data?.remainingCredits ?? 0);
  // This endpoint answers refusals with HTTP 200 and code -1.
  const msg = String(r.json?.message ?? r.json?.error ?? `HTTP ${r.status}`);
  if (r.status === 401 || /api key|no auth|unauthorized|sign in/i.test(msg)) {
    throw new EmakiError(msg, "auth", r.status);
  }
  if (r.status !== 200) throw errorFor(r.status, r.json ?? {});
  throw new EmakiError(msg, "other", r.status);
}
