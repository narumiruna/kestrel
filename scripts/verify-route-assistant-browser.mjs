// Chrome DevTools Protocol only. No Playwright, real accounts, tiles, or AI calls.
// Start backend/test/route-assistant-browser.fixture.cjs on 4330, Next --webpack
// with KESTREL_API_BASE_URL=http://127.0.0.1:4330 on 4331, and an isolated
// headless Chrome --remote-debugging-port=9335. Restart the fixture between stages.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { setTimeout as delay } from "node:timers/promises";

const stage = process.argv[2] ?? "core";
const origin = "http://127.0.0.1:4331";
const fixture = "http://127.0.0.1:4330";
const checks = [];
const observed = [];
const errors = [];
const check = (name, value) => {
  assert.ok(value, name);
  checks.push(name);
};
const configure = async (value) => {
  const response = await fetch(`${fixture}/__fixture`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
  assert.equal(response.status, 200);
};
const metrics = async () => (await fetch(`${fixture}/__fixture`)).json();
const initial = await metrics();
const tile = Buffer.from(
  await (await fetch(`${fixture}/__fixture/tile.png`)).arrayBuffer(),
).toString("base64");
const target = await (
  await fetch("http://127.0.0.1:9335/json/new?about:blank", { method: "PUT" })
).json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});
let sequence = 0;
const pending = new Map();
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 15000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  if (message.id) {
    const task = pending.get(message.id);
    if (!task) return;
    pending.delete(message.id);
    clearTimeout(task.timer);
    if (message.error) task.reject(new Error(`${message.error.message}`));
    else task.resolve(message.result);
  } else if (message.method === "Fetch.requestPaused") {
    void paused(message.params).catch((error) => errors.push(error.message));
  } else if (message.method === "Runtime.exceptionThrown") {
    errors.push(
      message.params.exceptionDetails.exception?.description ??
        message.params.exceptionDetails.text,
    );
  }
});
async function paused(event) {
  if (
    event.request.url.includes("tile.openstreetmap.org") ||
    event.request.url.includes("server.arcgisonline.com")
  ) {
    await call("Fetch.fulfillRequest", {
      requestId: event.requestId,
      responseCode: 200,
      responseHeaders: [
        { name: "Content-Type", value: "image/png" },
        { name: "Access-Control-Allow-Origin", value: "*" },
      ],
      body: tile,
    });
  } else if (event.request.url.includes("demotiles.maplibre.org")) {
    // An empty protobuf glyph collection is valid; route arrows are not needed by the fixture.
    await call("Fetch.fulfillRequest", {
      requestId: event.requestId,
      responseCode: 200,
      responseHeaders: [
        { name: "Content-Type", value: "application/x-protobuf" },
        { name: "Access-Control-Allow-Origin", value: "*" },
      ],
      body: "",
    });
  } else {
    if (
      event.request.method === "POST" &&
      event.request.url.endsWith("/ai/route-assistant/runs")
    ) {
      const raw =
        event.request.postData ??
        (
          await call("Network.getRequestPostData", {
            requestId: event.networkId,
          })
        ).postData;
      const body = JSON.parse(raw);
      const png = Buffer.from(body.snapshot.png, "base64");
      observed.push({
        hash: createHash("sha256").update(png).digest("hex"),
        snapshot: body.snapshot,
        request: body.request,
      });
    }
    await call("Fetch.continueRequest", { requestId: event.requestId });
  }
}
async function evaluate(expression) {
  const result = await call("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails)
    throw new Error(
      result.exceptionDetails.exception?.description ??
        result.exceptionDetails.text,
    );
  return result.result.value;
}
async function wait(expression, name, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await evaluate(`Boolean(${expression})`)) return;
    await delay(100);
  }
  const text = await evaluate("document.body.innerText.slice(-4000)");
  throw new Error(`Timed out: ${name}\n${text}`);
}
const button = (text) =>
  `[...document.querySelectorAll('button,[role=menuitemradio]')].find(b=>b.innerText.trim()===${JSON.stringify(text)})`;
async function click(text, twice = false) {
  if (twice)
    return evaluate(
      `(()=>{const b=${button(text)};if(!b||b.disabled)throw Error('Unavailable repeated Apply');b.click();b.click();return true;})()`,
    );
  const point = await evaluate(
    `(()=>{const b=${button(text)};if(!b||b.disabled)throw Error('Unavailable button: '+${JSON.stringify(text)});b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`,
  );
  await call("Input.dispatchMouseEvent", { type: "mouseMoved", ...point });
  await call("Input.dispatchMouseEvent", {
    type: "mousePressed",
    button: "left",
    clickCount: 1,
    ...point,
  });
  await call("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    button: "left",
    clickCount: 1,
    ...point,
  });
}
async function field(selector, value) {
  return evaluate(
    `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing field');const proto=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
}
async function stalledUpload(port, path, authorization) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Transfer-Encoding": "chunked",
          ...(authorization ? { Authorization: authorization } : {}),
        },
      },
      (response) => {
        response.resume();
        response.once("end", () => {
          request.destroy();
          resolve(response.statusCode);
        });
      },
    );
    request.once("error", reject);
    request.setTimeout(21000, () =>
      request.destroy(new Error("Upload rejection deadline")),
    );
    request.write("{"); // Deliberately never finish the body.
  });
}

async function load(count = 2) {
  await configure({ pointCount: count });
  await call("Page.navigate", {
    url: `${origin}/dashboard/map?kind=routes&selected=${initial.routeId}`,
  });
  await wait(
    `document.querySelector('.route-map-capability-ready') && ${button("Suggest a path")}`,
    "ready map",
  );
  await click("Suggest a path");
  await wait(
    `${button("Capture map")} && !${button("Capture map")}.disabled`,
    "capable model",
  );
  await delay(500);
  await evaluate(
    `(()=>{const node=document.querySelector('.route-map-canvas');const key=Object.keys(node).find(k=>k.startsWith('__reactFiber'));let fiber=node[key];for(let depth=0;fiber&&depth<30;depth++,fiber=fiber.return){let hook=fiber.memoizedState;for(let i=0;hook&&i<100;i++,hook=hook.next){const value=hook.memoizedState?.current;if(value&&typeof value.getCanvas==='function'&&typeof value.getSource==='function'){window.__fixtureMap=value;return true;}}}throw Error('Fixture map ref not found');})()`,
  );
}
async function capture(request = "Trace the visible path") {
  await wait(
    "window.__fixtureMap.loaded() && window.__fixtureMap.isStyleLoaded() && window.__fixtureMap.areTilesLoaded() && !window.__fixtureMap.isMoving()",
    "stable map before capture",
  );
  const began = Date.now();
  await field(".route-assistant textarea", request);
  await click("Capture map");
  await wait(
    "document.querySelector('.route-assistant img[src^=\"blob:\"]')",
    "capture",
  );
  const summary = await evaluate(
    `(async()=>{const img=document.querySelector('.route-assistant img');const bytes=await(await fetch(img.src)).arrayBuffer();const digest=await crypto.subtle.digest('SHA-256',bytes);return {hash:[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join(''),width:img.naturalWidth,height:img.naturalHeight};})()`,
  );
  check(
    "PNG dimensions bounded",
    summary.width <= 1600 && summary.height <= 1600,
  );
  check(
    "capture completes within five seconds without buffer preservation",
    Date.now() - began < 5000 &&
      (await evaluate(
        "window.__fixtureMap.getCanvas().getContext('webgl2').getContextAttributes().preserveDrawingBuffer===false",
      )),
  );
  return summary;
}
async function submit() {
  await evaluate(
    "document.querySelector('.route-assistant button[role=checkbox]').click()",
  );
  await click("Generate path");
}
async function proposal(request = "Trace the visible path", pan = false) {
  const image = await capture(request);
  await submit();
  if (pan) {
    await wait(
      "document.querySelector('.route-assistant').innerText.includes('Generating…')",
      "submitted snapshot",
    );
    await evaluate("void window.__fixtureMap.panBy([60, 0], {duration:0})");
  }
  await wait(
    `${button("Apply path")} && !${button("Apply path")}.disabled`,
    "complete candidate",
  );
  check(
    "exact reviewed PNG transferred once",
    observed.at(-1).hash === image.hash,
  );
  check(
    "candidate uses same existing map",
    await evaluate(
      "document.querySelectorAll('canvas.maplibregl-canvas').length===1 && !!document.querySelector('.route-assistant-map-legend')",
    ),
  );
  check(
    "result keeps keyboard focus in the composer",
    await evaluate(
      "document.querySelector('.route-assistant').contains(document.activeElement)",
    ),
  );
  const preview = await call("Page.captureScreenshot", { format: "png" });
  await writeFile(
    `/tmp/kestrel-route-preview-${stage}-${observed.length}.png`,
    Buffer.from(preview.data, "base64"),
  );
  await writeFile(
    `/tmp/kestrel-route-input-${stage}-${observed.length}.png`,
    Buffer.from(observed.at(-1).snapshot.png, "base64"),
  );
  return image;
}

try {
  await call("Page.enable");
  await call("Runtime.enable");
  await call("Network.enable", { maxPostDataSize: 4 * 1024 * 1024 });
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await call("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: "light" }],
  });
  await call("Fetch.enable", {
    patterns: [
      { urlPattern: "*tile.openstreetmap.org*" },
      { urlPattern: "*demotiles.maplibre.org*" },
      { urlPattern: "*server.arcgisonline.com*" },
      { urlPattern: `${origin}/api/backend/ai/route-assistant/runs` },
    ],
  });
  await call("Page.addScriptToEvaluateOnNewDocument", {
    source: `if(location.origin===${JSON.stringify(origin)}){localStorage.setItem('kestrel-map-style','plain');localStorage.setItem('kestrel.web.session',${JSON.stringify(JSON.stringify(initial.session))});}`,
  });
  if (stage === "uploads") {
    for (const [port, path] of [
      [4331, "/api/backend/ai/route-assistant/runs"],
      [4330, "/ai/route-assistant/runs"],
    ]) {
      const statuses = await Promise.all(
        Array.from({ length: 32 }, () => stalledUpload(port, path)),
      );
      check(
        `32 anonymous stalled uploads rejected at ${port}`,
        statuses.every((status) => status === 401 || status === 429),
      );
    }
    const start = Date.now();
    const statuses = await Promise.all([
      stalledUpload(
        4331,
        "/api/backend/ai/route-assistant/runs",
        `Bearer ${initial.session.accessToken}`,
      ),
      stalledUpload(
        4330,
        "/ai/route-assistant/runs",
        `Bearer ${initial.session.accessToken}`,
      ),
    ]);
    check(
      "authenticated stalled uploads expire at both hops",
      statuses.every((status) => status === 408) && Date.now() - start < 20000,
    );
    for (const url of [
      `${origin}/api/backend/ai/route-assistant/runs`,
      `${fixture}/ai/route-assistant/runs`,
    ]) {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${initial.session.accessToken}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      check(
        "capacity recovers after rejection and timeout",
        response.status === 400,
      );
    }
    check(
      "upload failures cannot invoke inference",
      (await metrics()).aiRuns === initial.aiRuns,
    );
  } else if (stage === "core") {
    await load();
    check(
      "no inference before capture",
      (await metrics()).aiRuns === initial.aiRuns,
    );
    await proposal();
    const before = await metrics();
    check("preview does not save", before.saves === initial.saves);
    check(
      "image and tool privacy verified",
      before.privacyVerified && before.imageVerification.matchesSnapshot,
    );
    await call("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
    });
    await call("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
    });
    check(
      "keyboard can reach explicit Apply",
      await evaluate("document.activeElement?.innerText==='Apply path'"),
    );
    await click("Apply path", true);
    await wait(
      "!document.querySelector('.route-assistant img')",
      "consumed image cleanup",
    );
    check(
      "Apply leaves manual Save pending",
      (await metrics()).saves === initial.saves,
    );
    await click("Edit");
    await wait(
      `${button("Undo")} && !${button("Undo")}.disabled`,
      "Undo after Apply",
    );
    check(
      "one Undo available after repeated Apply",
      await evaluate(`${button("Undo")} && !${button("Undo")}.disabled`),
    );
    await click("Undo");
    await wait(
      `${button("Undo")} && ${button("Undo")}.disabled && !${button("Redo")}.disabled`,
      "single Undo",
    );
    check(
      "single Undo restores baseline path",
      await evaluate(
        `${button("Undo")}.disabled && !${button("Redo")}.disabled`,
      ),
    );
    await click("Redo");
    await configure({ saveFailure: true });
    await click("Save route");
    await wait(
      "document.body.innerText.includes('Route not saved')",
      "failed Save",
    );
    check(
      "failed Save retains dirty draft",
      await evaluate(
        `${button("Save route")} && !${button("Save route")}.disabled`,
      ),
    );
    await configure({ saveFailure: false });
    await field(".route-assistant input[type=number]", "99");
    await click("Save route");
    await wait(
      `(document.body.innerText.includes('Saved just now.') || document.body.innerText.includes('Saved to cloud')) && !${button("Saving…")}`,
      "successful manual Save",
    );
    check(
      "manual Save preserves waypoint events",
      (await metrics()).lastFakeSavedRoute.currentRevision.waypoints.some(
        (p) => p.speedKmh === 5 && p.pauseSeconds === 2,
      ),
    );
    check(
      "invalid assistant input cannot block manual Save",
      await evaluate(
        "document.querySelector('.route-assistant input[type=number]').form===null",
      ),
    );
    await field(".route-assistant input[type=number]", "");
    await capture("ambiguous destination");
    await submit();
    await wait(
      "document.querySelector('.route-assistant').innerText.includes('Identify the intended visible destination')",
      "ambiguous clarification",
    );
    check(
      "clarification cannot Apply",
      !(await evaluate(`!!${button("Apply path")}`)),
    );
    await capture("visible loop");
    await field(".route-assistant input[type=number]", "20");
    await submit();
    await wait(
      "document.querySelector('.route-assistant').innerText.includes('failed or disconnected')",
      "loop budget failure",
    );
    check(
      "loop failure leaves no candidate",
      !(await evaluate(`!!${button("Apply path")}`)),
    );
    await configure({ delayMs: 5000 });
    await capture();
    await submit();
    await wait(`!!${button("Stop")}`, "running Stop");
    await delay(300);
    await click("Stop");
    await wait(
      "document.querySelector('.route-assistant').innerText.includes('Stopped.')",
      "Stop feedback",
    );
    await delay(500);
    check(
      "Stop propagates through Next proxy",
      (await metrics()).abortedRuns > before.abortedRuns,
    );
  } else if (stage === "captures") {
    for (const count of [2, 50, 1000]) {
      await load(count);
      const image = await proposal(
        count === 2 ? "Trace the visible path" : "dense visible path",
        count === 2,
      );
      check(
        `current ${count}-point map capture`,
        image.width > 320 && image.height > 100,
      );
      const rendered = await evaluate(
        "(async()=>{const source=window.__fixtureMap.getSource('route-assistant-candidate');const data=await source.getData();return {count:data.geometry.coordinates.length,points:data.geometry.coordinates,tolerance:window.__fixtureMap.getStyle().sources['route-assistant-candidate'].tolerance};})()",
      );
      check(
        `exact ${count}-point candidate rendered`,
        rendered.count === count && rendered.tolerance === 0,
      );
      if (count === 1000) {
        await click("Apply path");
        await wait(
          `!document.querySelector('.route-assistant img') && !!${button("Save route")}`,
          "1000-point Apply",
        );
        await click("Save route");
        await wait(
          "document.body.innerText.includes('Saved just now.')",
          "1000-point Save",
        );
        const saved = (await metrics()).lastFakeSavedRoute.currentRevision;
        assert.deepEqual(
          saved.waypoints.map((p) => [p.longitude, p.latitude]),
          rendered.points,
        );
        check(
          "1000-point Apply and Save preserve the exact candidate geometry",
          saved.waypoints.length === 1000 &&
            saved.waypoints[0].speedKmh === 5 &&
            saved.waypoints[0].pauseSeconds === 2,
        );
      } else await click("Discard suggestion");
      check(
        "consume or discard clears the attachment",
        !(await evaluate("!!document.querySelector('.route-assistant img')")),
      );
    }
    await load(2);
    await evaluate(
      "void window.__fixtureMap.jumpTo({center:[-45,0],zoom:Math.log2(window.__fixtureMap.getCanvas().clientWidth/(512*0.75)),padding:{top:0,bottom:0,left:0,right:0}})",
    );
    await delay(700);
    await capture("wide visible path");
    await submit();
    await wait(
      `!!${button("Apply path")} && !!document.querySelector('.route-assistant-map-legend')`,
      "wide-view candidate",
    );
    const wide = observed.at(-1).snapshot.transform;
    const world = wide.origin[0] + 0.9 * wide.xAxis[0] + 0.5 * wide.yAxis[0];
    const longitude = ((((world * 360) % 360) + 360) % 360) - 180;
    const visible = await evaluate(
      "window.__fixtureMap.getSource('route-assistant-candidate').getData().then(data=>data.geometry.coordinates[0][0])",
    );
    check(
      "wide non-repeated capture keeps points in the visible longitude world",
      wide.xAxis[0] > 0.5 &&
        wide.xAxis[0] < 1 &&
        Math.abs(visible - longitude) < 1e-7,
    );
    await click("Discard suggestion");
    for (const [label, style] of [
      ["Terrain", "terrain"],
      ["Dark", "dark"],
      ["Satellite", "satellite"],
      ["Plain", "plain"],
    ]) {
      await click("Map tools");
      await wait(`!!${button(label)}`, "map style menu");
      await click(label);
      await wait(
        "window.__fixtureMap.isStyleLoaded() && window.__fixtureMap.areTilesLoaded() && !window.__fixtureMap.isMoving()",
        "style loading",
      );
      await delay(300);
      if (style === "satellite") {
        await click("Capture map");
        await wait(
          "document.querySelector('.route-assistant').innerText.includes('non-satellite map')",
          "satellite permission failure",
        );
        check(
          "satellite source remains unavailable for inference",
          !(await evaluate("!!document.querySelector('.route-assistant img')")),
        );
      } else {
        await capture();
        check(
          `licensed ${style} source retains its attribution`,
          await evaluate(
            "document.querySelector('.route-assistant').innerText.includes('OpenStreetMap contributors')",
          ),
        );
        await click("Remove screenshot");
      }
    }
    const beforeFailures = await metrics();
    await load(2);
    await capture();
    const removedUrl = await evaluate(
      "document.querySelector('.route-assistant img').src",
    );
    await click("Remove screenshot");
    check(
      "explicit unsent removal releases the object URL",
      await evaluate(
        `fetch(${JSON.stringify(removedUrl)}).then(()=>false,()=>true)`,
      ),
    );
    check(
      "removed screenshot cannot be submitted or reused",
      !(await evaluate(`!!${button("Generate path")}`)),
    );
    await evaluate(
      `(async()=>{window.__originalToBlob=HTMLCanvasElement.prototype.toBlob;window.__corsImage=new Image();await new Promise((resolve,reject)=>{window.__corsImage.onload=resolve;window.__corsImage.onerror=reject;window.__corsImage.src='${fixture}/__fixture/tile.png';});HTMLCanvasElement.prototype.toBlob=function(...args){this.getContext('2d').drawImage(window.__corsImage,0,0,1,1);return window.__originalToBlob.apply(this,args);};})()`,
    );
    await click("Capture map");
    await wait(
      "document.querySelector('.route-assistant').innerText.includes('Capture failed')",
      "CORS failure",
    );
    await evaluate(
      "HTMLCanvasElement.prototype.toBlob=window.__originalToBlob",
    );
    check(
      "CORS failure makes no inference request",
      (await metrics()).aiRuns === beforeFailures.aiRuns,
    );
    await evaluate(
      "window.__originalDrawImage=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(...args){if(args[0] instanceof HTMLCanvasElement && args[0].classList.contains('maplibregl-canvas')){this.clearRect(0,0,this.canvas.width,this.canvas.height);return;}return window.__originalDrawImage.apply(this,args);}",
    );
    await click("Capture map");
    await wait(
      "document.querySelector('.route-assistant').innerText.includes('Capture failed')",
      "blank framebuffer failure",
    );
    await evaluate(
      "CanvasRenderingContext2D.prototype.drawImage=window.__originalDrawImage",
    );
    check(
      "blank export cannot attach an image",
      !(await evaluate("!!document.querySelector('.route-assistant img')")),
    );
    for (const action of [
      "window.__fixtureMap.panBy([8,0],{duration:0})",
      "window.__fixtureMap.getContainer().style.width='calc(100% - 12px)'",
      "(()=>{const style=window.__fixtureMap.getStyle();const layer=style.layers.find(l=>l.type==='raster');layer.paint={...layer.paint,'raster-opacity':0.95};window.__fixtureMap.setStyle(style);})()",
    ]) {
      await evaluate(
        "HTMLCanvasElement.prototype.toBlob=function(callback,...args){return window.__originalToBlob.call(this,(blob)=>setTimeout(()=>callback(blob),300),...args);}",
      );
      await click("Capture map");
      await delay(40);
      await evaluate(`void (${action})`);
      await delay(600);
      check(
        `capture race ${action} cannot restore a late attachment`,
        !(await evaluate("!!document.querySelector('.route-assistant img')")),
      );
      await evaluate(
        "HTMLCanvasElement.prototype.toBlob=window.__originalToBlob",
      );
    }
    await call("Fetch.enable", {
      patterns: [
        { urlPattern: "*tile.openstreetmap.org*" },
        { urlPattern: "*demotiles.maplibre.org*" },
      ],
    });
    const oversized = await evaluate(
      `fetch('/api/backend/ai/route-assistant/runs',{method:'POST',headers:{Authorization:'Bearer ${initial.session.accessToken}','Content-Type':'application/json'},body:JSON.stringify({oversized:'x'.repeat(4*1024*1024)})}).then(r=>r.status)`,
    );
    check(
      "actual Next proxy rejects an oversized browser upload",
      oversized === 413,
    );
    check(
      "capture and upload failures never start inference",
      (await metrics()).aiRuns === beforeFailures.aiRuns,
    );
    await configure({
      imageInput: false,
      settingsGeneration: initial.config.settingsGeneration + 1,
    });
    await call("Page.reload");
    await wait(`!!${button("Suggest a path")}`, "unsupported model reload");
    await click("Suggest a path");
    await wait(
      `${button("Capture map")} && ${button("Capture map")}.disabled`,
      "unsupported model",
    );
    check(
      "unsupported model cannot capture or submit",
      !(await evaluate(`!!${button("Generate path")}`)),
    );
  } else if (stage === "loops") {
    await load();
    await capture("loop-success visible path");
    await field(".route-assistant input[type=number]", "1");
    await submit();
    await wait(
      `!!${button("Apply path")} && !!document.querySelector('.route-assistant-map-legend')`,
      "valid loop candidate",
    );
    check(
      "loop reports measured target and error",
      await evaluate(
        "document.querySelector('.route-assistant').innerText.includes('1.00 km') && document.querySelector('.route-assistant').innerText.includes('0.0%')",
      ),
    );
    check(
      "event removal blocks Apply until explicit confirmation",
      await evaluate(`${button("Apply path")}.disabled`),
    );
    const beforeApply = await metrics();
    check("loop preview does not save", beforeApply.saves === initial.saves);
    await evaluate(
      "document.querySelector('.route-assistant [role=checkbox]').click()",
    );
    await wait(`!${button("Apply path")}.disabled`, "event removal consent");
    await click("Apply path");
    await wait("!document.querySelector('.route-assistant img')", "loop Apply");
    await click("Edit");
    await click("Undo");
    check(
      "loop Apply uses one Undo entry",
      await evaluate(
        `${button("Undo")}.disabled && !${button("Redo")}.disabled`,
      ),
    );
    await capture("outage visible path");
    await submit();
    await wait(
      "document.querySelector('.route-assistant').innerText.includes('failed or disconnected')",
      "provider outage",
    );
    check(
      "provider outage leaves draft and persistence unchanged",
      !(await evaluate(`!!${button("Apply path")}`)) &&
        (await metrics()).saves === initial.saves,
    );
  } else if (stage === "lifecycle") {
    await load();
    await configure({ delayMs: 2000 });
    await capture();
    await submit();
    await wait(`!!${button("Stop")}`, "running generation");
    await click("Edit");
    await field("#route-name", "Changed while running");
    await wait(
      "document.querySelector('.route-assistant').innerText.includes('changed. Capture again')",
      "draft invalidation",
    );
    await delay(2200);
    check(
      "late completion cannot restore candidate",
      !(await evaluate(`!!${button("Apply path")}`)),
    );
    await configure({ delayMs: 100 });
    await proposal();
    await configure({
      settingsGeneration: initial.config.settingsGeneration + 1,
    });
    await wait(
      "document.querySelector('.route-assistant').innerText.includes('changed. Capture again')",
      "settings invalidation",
    );
    check(
      "settings changes clear preview",
      !(await evaluate(
        "!!document.querySelector('.route-assistant-map-legend')",
      )),
    );
    await capture();
    await submit();
    await wait(`!!${button("Apply path")}`, "new current generation");
    await click("Save route");
    await wait(
      "!document.querySelector('.route-assistant img')",
      "Save baseline invalidation",
    );
    check(
      "Save cannot revive a pending candidate",
      !(await evaluate(`!!${button("Apply path")}`)),
    );
    await configure({ delayMs: 2000 });
    await capture();
    await submit();
    await wait(`!!${button("Stop")}`, "disconnect run");
    await call("Network.emulateNetworkConditions", {
      offline: true,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    await delay(2500);
    await call("Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    await wait(
      "!document.querySelector('.route-assistant img')",
      "disconnect cleanup",
    );
    check(
      "disconnect never replays paid submission",
      (await metrics()).aiRuns - initial.aiRuns <= 4,
    );
  } else throw new Error("Unknown stage");
  const screenshot = await call("Page.captureScreenshot", { format: "png" });
  await writeFile(
    `/tmp/kestrel-route-assistant-${stage}.png`,
    Buffer.from(screenshot.data, "base64"),
  );
  if (errors.length) console.error(JSON.stringify(errors));
  check("no uncaught browser exception", errors.length === 0);
  await writeFile(
    `/tmp/kestrel-route-assistant-${stage}.json`,
    JSON.stringify(
      { stage, viewport: "1440x900 light", checks, transfers: observed.length },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      stage,
      checks: checks.length,
      transfers: observed.length,
      screenshot: `/tmp/kestrel-route-assistant-${stage}.png`,
    }),
  );
} finally {
  await call("Fetch.disable").catch(() => {});
  socket.close();
  await fetch(`http://127.0.0.1:9335/json/close/${target.id}`).catch(() => {});
}
