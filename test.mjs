// node test.mjs  (runs against dist/ after `npm run build`)
import assert from "node:assert/strict";
import { test } from "node:test";
import { credits, errorFor, generateImage, generateVideo, submit } from "./dist/mod.js";

function fake(calls, polls, submitReply = [200, { success: true, data: { id: "v1", status: "generating" } }]) {
  polls = [...polls];
  return async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
    let [status, json] = url.endsWith("/api/video/ai") ? submitReply
      : url.endsWith("/api/video/status") ? [200, { success: true, data: polls.shift() }]
      : [200, { code: 0, data: { remainingCredits: 42, hasPurchasedCredits: false } }];
    return new Response(JSON.stringify(json), { status });
  };
}

test("video polls until completed", async () => {
  const calls = [];
  const url = await generateVideo("a boat", {
    apiKey: "sk-abc", pollEvery: 0, baseUrl: "https://t", parameters: { duration: 5, resolution: "720p" },
    fetch: fake(calls, [{ id: "v1", status: "generating" }, { id: "v1", status: "completed", videoUrl: "https://cdn/v.mp4" }]),
  });
  assert.equal(url, "https://cdn/v.mp4");
  assert.equal(calls[0].url, "https://t/api/video/ai");
  assert.deepEqual(calls[0].body, { prompt: "a boat", model: "seedance_2_5", parameters: { duration: 5, resolution: "720p" } });
  assert.equal(calls[0].headers.authorization, "Bearer sk-abc");
  assert.deepEqual(calls[1].body, { videoId: "v1" });
  assert.equal(calls.length, 3);
});

test("image default model", async () => {
  const calls = [];
  const url = await generateImage("x", { apiKey: "sk", pollEvery: 0, fetch: fake(calls, [{ status: "completed", videoUrl: "https://cdn/i.png" }]) });
  assert.equal(url, "https://cdn/i.png");
  assert.equal(calls[0].body.model, "nano_banana_2_lite");
});

test("failed run carries failureCode", async () => {
  await assert.rejects(
    generateVideo("x", { apiKey: "sk", pollEvery: 0, fetch: fake([], [{ status: "failed", failureCode: "provider_error" }]) }),
    (e) => e.kind === "failed" && e.code === "provider_error",
  );
});

test("error mapping", async () => {
  const cases = [
    [401, { error: "Invalid API key. Create one at https://emaki.ai/settings/apikeys" }, "auth"],
    [402, { error: "Insufficient credits" }, "quota"],
    [403, { error: "purchase required" }, "plan"],
    [409, { error: "Video generation is already in progress" }, "busy"],
    [429, { error: "slow down", code: "content_cooldown" }, "rejected"],
    [400, { error: "blocked", code: "content_blocked" }, "rejected"],
    [400, { error: "duration must be 4-30" }, "other"],
  ];
  for (const [s, body, kind] of cases) {
    assert.equal(errorFor(s, body).kind, kind);
    await assert.rejects(submit("x", "seedance_2_5", {}, { apiKey: "sk", fetch: fake([], [], [s, body]) }), (e) => e.kind === kind && e.message === body.error);
  }
});

test("credits", async () => {
  assert.equal(await credits({ apiKey: "sk", fetch: fake([], []) }), 42);
  const bad = async () => new Response(JSON.stringify({ code: -1, message: "no auth, please sign in" }));
  await assert.rejects(credits({ apiKey: "sk", fetch: bad }), (e) => e.kind === "auth");
});

test("needs a key", async () => {
  delete process.env.EMAKI_API_KEY;
  await assert.rejects(generateVideo("x"), (e) => e.kind === "auth");
});
