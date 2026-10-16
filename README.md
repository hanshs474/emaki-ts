# emaki-ai

Official SDK for emaki (emaki.ai), the Japanese-language AI video generator for Seedance 2.5 and Seedance 2.0.

This is the TypeScript / JavaScript client for [emaki](https://emaki.ai/?utm_source=npm&utm_medium=package), for Node 18+, Deno and Bun. One API key runs [Seedance 2.5](https://emaki.ai/seedance-2-5), [Seedance 2.0](https://emaki.ai/seedance-2) and the other video and image models on the site, on your own credits.

日本語での使い方は [シーダンス](https://emaki.ai/) へ。

```bash
npm install emaki-ai
```

```ts
import { generateVideo, generateImage } from "emaki-ai";

const clip = await generateVideo("a paper boat drifting down a rain gutter, low angle, slow push-in");
const pic = await generateImage("a paper-cut layered mountain range at dusk", { parameters: { aspect_ratio: "16:9" } });
```

Uses the global `fetch`, no dependencies. Each call waits for the run and resolves to the URL of the finished file.

## API key

Sign in on [emaki.ai](https://emaki.ai/?utm_source=npm&utm_medium=package), create a key at [emaki.ai/settings/apikeys](https://emaki.ai/settings/apikeys), then pass it as `apiKey` or set it in the environment:

```bash
export EMAKI_API_KEY=sk-...
```

A key runs on your account exactly like the site does. Every run costs credits on your emaki account, the same price as on the website.

```ts
import { credits } from "emaki-ai";
console.log(await credits()); // remaining credits, free to call
```

## Video

```ts
await generateVideo("a fox trotting through fresh snow at dawn, tracking shot", {
  parameters: { duration: 8, resolution: "720p", aspect_ratio: "9:16" },
});

// image to video: the image becomes the first frame
await generateVideo("the camera slowly orbits the statue", {
  parameters: { image: "https://example.com/statue.jpg" },
});

// another model
await generateVideo("a street drummer in the rain", { model: "seedance_2_fast" });
```

The default model is `seedance_2_5`. Other ids: `seedance_2`, `seedance_2_fast`, `seedance_2_mini`, `minimax_h3`, `veo_3_1`. `parameters` is sent as it is (`duration`, `resolution`, `aspect_ratio`, `generate_audio`, `image`, `last_frame_image`; Veo 3.1 takes `aspectRatio`).

Turning a still into a clip on the site works the same way: see [image to video](https://emaki.ai/image-to-video). To sharpen a finished clip there is the [AI video upscaler](https://emaki.ai/video-upscaler).

## Images

```ts
await generateImage("isometric diorama of a ramen shop at night", { parameters: { aspect_ratio: "1:1" } });
await generateImage("a glass perfume bottle on wet slate", { model: "gpt_image_2", parameters: { resolution: "2K" } });
```

The default model is `nano_banana_2_lite`. Other ids: `nano_banana_2`, `seedream_5_lite`, `gpt_image_2`.

## Submit now, collect later

```ts
import { submit, status, wait } from "emaki-ai";

const id = await submit("a lighthouse in a storm, waves crashing", "seedance_2_5", { duration: 5 });
console.log((await status(id)).status); // generating | completed | failed
const url = await wait(id);             // polls every 5 seconds, 15 minutes by default
```

## Errors worth catching

Every failure is an `EmakiError`; branch on `kind`:

- `auth`: no key, or the key is wrong or deleted
- `quota`: the account is out of credits
- `plan`: that model needs a purchase on the account first
- `busy`: another run on this account is still generating
- `rejected`: the content filter refused the prompt, or a cooldown is active; reword it
- `failed`: the run was accepted but failed; `code` holds the failure code
- `timeout`, `other`: anything else, with the server's message

MIT licensed. Made by [emaki](https://emaki.ai/?utm_source=npm&utm_medium=package).
