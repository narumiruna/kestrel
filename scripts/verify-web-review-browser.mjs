// Chrome DevTools Protocol regression checks; no Playwright or live services.
// Start scripts/web-review-browser.fixture.mjs on 4330, a current production Web
// build with KESTREL_API_BASE_URL=http://127.0.0.1:4330 on 4331, and an isolated
// headless Chrome profile with --remote-debugging-port=9335. Use SwiftShader
// when hardware WebGL is unavailable. All external page requests are intercepted.
// Run: node scripts/verify-web-review-browser.mjs
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
const origin = "http://127.0.0.1:4331";
const fixture = "http://127.0.0.1:4330";
const output = await mkdtemp(join(tmpdir(), "kestrel-web-review-"));
const checkNames = [];
const check = (name, value) => {
  assert.ok(value, name);
  checkNames.push(name);
  console.log("PASS", name);
};
const config = async (body) =>
  fetch(`${fixture}/__fixture`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const metrics = async () => (await fetch(`${fixture}/__fixture`)).json();
const sessions = [];
async function page() {
  const target = await (
    await fetch("http://127.0.0.1:9335/json/new?about:blank", { method: "PUT" })
  ).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  let seq = 0;
  const tasks = new Map();
  const errors = [];
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => {
        tasks.delete(id);
        reject(Error(`CDP timeout ${method}`));
      }, 15000);
      tasks.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params }));
    });
  ws.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const task = tasks.get(message.id);
      if (!task) return;
      tasks.delete(message.id);
      clearTimeout(task.timer);
      message.error
        ? task.reject(Error(message.error.message))
        : task.resolve(message.result);
    } else if (message.method === "Fetch.requestPaused") {
      const e = message.params,
        url = new URL(e.request.url);
      let action;
      if (["127.0.0.1", "localhost"].includes(url.hostname))
        action = call("Fetch.continueRequest", { requestId: e.requestId });
      else if (
        url.pathname.endsWith(".png") ||
        url.hostname.includes("arcgisonline")
      )
        action = call("Fetch.fulfillRequest", {
          requestId: e.requestId,
          responseCode: 200,
          responseHeaders: [
            { name: "Content-Type", value: "image/png" },
            { name: "Access-Control-Allow-Origin", value: "*" },
          ],
          body: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR/0AAAAASUVORK5CYII=",
        });
      else if (url.pathname.endsWith(".pbf"))
        action = call("Fetch.fulfillRequest", {
          requestId: e.requestId,
          responseCode: 200,
          responseHeaders: [
            { name: "Access-Control-Allow-Origin", value: "*" },
          ],
          body: "",
        });
      else
        action = call("Fetch.failRequest", {
          requestId: e.requestId,
          errorReason: "Aborted",
        });
      action.catch((error) => {
        if (error.message !== "Invalid InterceptionId.")
          errors.push(`CDP: ${error.message}`);
      });
    } else if (message.method === "Runtime.exceptionThrown")
      errors.push(
        message.params.exceptionDetails.exception?.description ??
          message.params.exceptionDetails.text,
      );
  });
  const evaluate = async (expression) => {
    const result = await call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails)
      throw Error(
        result.exceptionDetails.exception?.description ??
          result.exceptionDetails.text,
      );
    return result.result.value;
  };
  const wait = async (expression, name, ms = 15000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      try {
        if (await evaluate(`Boolean(${expression})`)) return;
      } catch {}
      await delay(80);
    }
    throw Error(
      `Timeout ${name}: ${await evaluate("document.body.innerText.slice(-3500)")}`,
    );
  };
  const click = async (expression) => {
    await call("Page.bringToFront");
    await delay(300);
    const point = await evaluate(
      `(()=>{const e=${expression};if(!e||e.disabled)throw Error('Missing/disabled control');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`,
    );
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
  };
  const field = async (selector, value) => {
    if (
      selector === "#route-name" &&
      (await evaluate('document.querySelector("#route-name")?.readOnly'))
    ) {
      await click(
        `[...document.querySelectorAll('[role=tab]')].find(e=>e.innerText.trim()==='Edit')`,
      );
    }
    await evaluate(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing field');e.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
    await delay(100);
  };
  await call("Page.enable");
  await call("Runtime.enable");
  await call("Network.enable");
  await call("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  await call("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await call("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: "light" }],
  });
  const result = {
    target,
    call,
    evaluate,
    wait,
    click,
    field,
    errors,
    close: async () => {
      ws.close();
      await fetch(`http://127.0.0.1:9335/json/close/${target.id}`);
    },
  };
  sessions.push(result);
  return result;
}
const button = (text) =>
  `[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)})`;
const dialogButton = (text) =>
  `[...document.querySelectorAll('[role="alertdialog"] button')].find(e=>e.textContent.trim()===${JSON.stringify(text)})`;
const placeInput = "#radix-field-components-dashboard-placeeditor-tsx-1";
const latInput = "#radix-field-components-dashboard-placeeditor-tsx-2";
try {
  const p = await page();
  await p.call("Page.navigate", { url: `${origin}/status` });
  await p.wait('location.pathname==="/status"', "same-origin setup");
  const seed = (await metrics()).session;
  await p.evaluate(
    `localStorage.setItem('kestrel.web.session',${JSON.stringify(JSON.stringify(seed))});localStorage.setItem('kestrel-theme','light');`,
  );
  await p.call("Page.navigate", { url: `${origin}/dashboard/library` });
  await p.wait(
    'document.querySelectorAll(".library-item-row").length===3',
    "library hydration",
  );
  check(
    "desktop light fixture ready",
    await p.evaluate(
      'innerWidth===1440&&innerHeight===900&&document.documentElement.dataset.theme==="light"',
    ),
  );
  // Route Back: cancel twice, keep exact values and history length, then confirm once.
  await p.click(
    `[...document.querySelectorAll('.library-item-row')].find(e=>e.textContent.includes('Fixture route')).querySelector('a[href*="/dashboard/map"]')`,
  );
  await p.wait(
    'document.querySelector("#route-name")?.value==="Fixture route"',
    "route editor",
  );
  await p.field("#route-name", "Unsaved route");
  const before = await p.evaluate(
    "({url:location.href,length:history.length,position:history.state.kestrelHistoryPosition,hasNext:history.state.__NA})",
  );
  for (let attempt = 0; attempt < 2; attempt++) {
    await p.evaluate("history.back()");
    await p.wait(
      'document.querySelector("[role=alertdialog]")',
      "Back confirmation",
    );
    check(
      `Back retains draft and URL ${attempt + 1}`,
      await p.evaluate(
        `location.href===${JSON.stringify(before.url)}&&document.querySelector('#route-name')?.value==='Unsaved route'&&history.length===${before.length}&&history.state.__NA===true`,
      ),
    );
    await p.click(dialogButton("Keep editing"));
    await p.wait(
      '!document.querySelector("[role=alertdialog]")',
      "cancel closes dialog",
    );
    await delay(300);
    check(
      `cancel restores field focus ${attempt + 1}`,
      await p.evaluate('document.activeElement?.id==="route-name"'),
    );
  }
  const shot = await p.call("Page.captureScreenshot", { format: "png" });
  await writeFile(join(output, "draft.png"), Buffer.from(shot.data, "base64"));
  await p.evaluate("history.back()");
  await p.wait(
    'document.querySelector("[role=alertdialog]")',
    "confirmed Back",
  );
  await p.click(dialogButton("Discard changes"));
  await p.wait(
    'location.pathname==="/dashboard/library"&&document.querySelectorAll(".library-item-row").length===3',
    "Back reaches library",
  );
  await delay(250);
  check(
    "confirm reaches original Library exactly once",
    await p.evaluate(
      `history.length===${before.length}&&history.state.kestrelHistoryPosition===${before.position - 1}`,
    ),
  );
  await p.evaluate("history.forward()");
  await p.wait(
    'document.querySelector("#route-name")?.value==="Fixture route"',
    "clean Forward route",
  );
  check(
    "clean Forward preserves Next metadata and adds no entries",
    await p.evaluate(
      `history.length===${before.length}&&history.state.__NA===true&&!document.querySelector('[role=alertdialog]')`,
    ),
  );
  // Same-page query traversal must also preserve/reselect correctly.
  await p.evaluate(
    `history.pushState(history.state,'','/dashboard/map?kind=places&selected=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')`,
  );
  await p.field("#route-name", "Query draft");
  await p.evaluate("history.back()");
  await p.wait(
    'document.querySelector("[role=alertdialog]")',
    "query Back guard",
  );
  check(
    "query Back cancel keeps exact query and draft",
    await p.evaluate(
      'location.search.includes("kind=places")&&document.querySelector("#route-name")?.value==="Query draft"',
    ),
  );
  await p.click(dialogButton("Discard changes"));
  await p.wait(
    'document.querySelector("#route-name")?.value==="Fixture route"',
    "query confirmation restores URL selection",
  );
  await p.field("#route-name", "Forward draft");
  await p.evaluate("history.forward()");
  await p.wait(
    'document.querySelector("[role=alertdialog]")',
    "dirty Forward guard",
  );
  check(
    "dirty Forward restores current URL and draft",
    await p.evaluate(
      '!location.search.includes("kind=places")&&document.querySelector("#route-name")?.value==="Forward draft"',
    ),
  );
  await p.click(dialogButton("Keep editing"));
  await p.wait(
    '!document.querySelector("[role=alertdialog]")',
    "Forward cancel",
  );
  await p.evaluate("history.forward()");
  await p.wait(
    'document.querySelector("[role=alertdialog]")',
    "Forward replay guard",
  );
  await p.click(dialogButton("Discard changes"));
  await p.wait(
    `document.querySelector(${JSON.stringify(placeInput)})?.value==='Fixture place'`,
    "Forward confirms original Place query",
  );
  await p.evaluate("history.back()");
  await p.wait(
    'document.querySelector("#route-name")?.value==="Fixture route"',
    "clean query Back",
  );
  // Open existing Place through clean browser Back and a normal Link.
  await p.evaluate("history.back()");
  await p.wait('location.pathname==="/dashboard/library"', "return to Library");
  await p.click(
    `[...document.querySelectorAll('.library-item-row')].find(e=>e.textContent.includes('Fixture place')).querySelector('a[href*="/dashboard/map"]')`,
  );
  await p.wait(
    `document.querySelector(${JSON.stringify(placeInput)})?.value==='Fixture place'`,
    "place editor",
  );
  await p.field(placeInput, "Unsaved place");
  await p.field(latInput, "100");
  check(
    "invalid latitude stays editable without removing workspace",
    await p.evaluate(
      `document.querySelector(${JSON.stringify(latInput)})?.value==='100'&&!!document.querySelector('.cartographer-stage')`,
    ),
  );
  await p.click(button("Save place"));
  await p.wait(
    `document.querySelector(${JSON.stringify(latInput)})?.getAttribute('aria-invalid')==='true'`,
    "coordinate validation on submit",
  );
  check(
    "invalid coordinate submission identifies and focuses the field",
    await p.evaluate(
      `document.activeElement===document.querySelector(${JSON.stringify(latInput)})&&!!document.querySelector('.place-editor [role=alert]')`,
    ),
  );
  await p.field(latInput, "-");
  await delay(250);
  check(
    "incomplete coordinate text is not replaced by preview refresh",
    await p.evaluate(
      `document.querySelector(${JSON.stringify(latInput)})?.value==='-'&&document.querySelector(${JSON.stringify(latInput)})?.getAttribute('aria-invalid')==='true'`,
    ),
  );
  await p.field(latInput, "26.25");
  check(
    "corrected coordinate clears the submitted error state",
    await p.evaluate(
      `!document.querySelector(${JSON.stringify(latInput)})?.hasAttribute('aria-invalid')&&!document.querySelector('.place-editor [role=alert]')`,
    ),
  );
  await p.evaluate(
    `history.pushState(history.state,'',location.href+'&check=same-place')`,
  );
  await p.evaluate("history.back()");
  await p.wait(
    'document.querySelector("[role=alertdialog]")',
    "same-Place query guard",
  );
  await p.click(dialogButton("Discard changes"));
  await p.wait(
    `document.querySelector(${JSON.stringify(placeInput)})?.value==='Fixture place'`,
    "same-Place discard remount",
  );
  check(
    "confirmed same-Place traversal resets fields and dirty status",
    await p.evaluate(
      `document.querySelector(${JSON.stringify(latInput)})?.value==='25.033000'&&!document.querySelector('.unsaved-changes-label')`,
    ),
  );
  await p.field(placeInput, "Unsaved place");
  await p.field(latInput, "26.25");
  const reads = (await metrics()).placeReads,
    refreshes = (await metrics()).refreshes;
  const second = await page();
  await second.call("Page.navigate", { url: `${origin}/dashboard/library` });
  await second.wait(
    'document.querySelector(".library-item-list")',
    "second tab refresh",
  );
  await delay(250);
  check(
    "same-session second-tab refresh keeps name and coordinates",
    await p.evaluate(
      `document.querySelector(${JSON.stringify(placeInput)})?.value==='Unsaved place'&&document.querySelector(${JSON.stringify(latInput)})?.value==='26.25'`,
    ),
  );
  check(
    "token rotation does not reload the editing tab library",
    (await metrics()).placeReads === reads + 1 &&
      (await metrics()).refreshes > refreshes,
  );
  await p.evaluate("history.back()");
  await p.wait(
    'document.querySelector("[role=alertdialog]")',
    "Place dirty guard after rotation",
  );
  await p.click(dialogButton("Keep editing"));
  await p.wait(
    '!document.querySelector("[role=alertdialog]")',
    "Place guard cancel",
  );
  check(
    "Place dirty protection survives token rotation",
    await p.evaluate(
      `document.querySelector(${JSON.stringify(placeInput)})?.value==='Unsaved place'`,
    ),
  );
  // Guard Sign out; cancellation must preserve session and focus.
  await p.click('document.querySelector(".kc-user-button")');
  await p.wait(
    'document.querySelector(".account-menu-logout")',
    "account menu",
  );
  await p.click('document.querySelector(".account-menu-logout")');
  await p.wait(
    'document.querySelector("[role=alertdialog]")',
    "Sign out confirmation",
  );
  await p.click(dialogButton("Keep editing"));
  await p.wait(
    '!document.querySelector("[role=alertdialog]")',
    "Sign out cancel",
  );
  await delay(300);
  check(
    "Sign out cancel retains session and stable menu focus",
    await p.evaluate(
      '!!localStorage.getItem("kestrel.web.session")&&document.activeElement?.classList.contains("kc-user-button")',
    ),
  );
  // Existing Place Save must clear dirty state only for saved fields.
  await p.click(button("Save place"));
  await p.wait(
    'document.querySelector(".place-save-state")?.textContent.includes("Saved")',
    "Place save",
  );
  check(
    "Place save persists edited coordinates",
    (await metrics()).placeWrites === 1,
  );
  await p.evaluate("history.back()");
  await p.wait(
    'location.pathname==="/dashboard/library"',
    "clean saved Place exit",
  );
  // Hold the old Routes read while deleting a Place; release after the new refresh.
  await config({ holdRoutes: true });
  await p.click('document.querySelector(".workspace-refresh-button")');
  const heldEnd = Date.now() + 5000;
  while ((await metrics()).held !== 1 && Date.now() < heldEnd) await delay(50);
  assert.equal((await metrics()).held, 1);
  await p.click(
    `[...document.querySelectorAll('.library-item-row')].find(e=>e.textContent.includes('Delete fixture')).querySelector('.library-more-menu-trigger')`,
  );
  await p.wait(
    '[...document.querySelectorAll("[role=menuitem]")].some(e=>e.textContent.includes("Delete"))',
    "delete menu",
  );
  await p.click(
    `[...document.querySelectorAll('[role=menuitem]')].find(e=>e.textContent.includes('Delete'))`,
  );
  await p.wait(
    'document.querySelector("[role=alertdialog]")',
    "delete confirmation",
  );
  await p.click(dialogButton("Delete place"));
  await p.wait(
    '![...document.querySelectorAll(".library-item-row")].some(e=>e.textContent.includes("Delete fixture"))',
    "new refresh removes deleted row",
  );
  await config({ release: true });
  await delay(400);
  check(
    "late older refresh cannot restore deleted item",
    await p.evaluate(
      '![...document.querySelectorAll(".library-item-row")].some(e=>e.textContent.includes("Delete fixture"))',
    ),
  );
  // Actual proxy: reject the body before the dummy Backend observes login.
  const loginBefore = (await metrics()).loginCalls;
  const oversized = await fetch(`${origin}/api/backend/auth/login`, {
    method: "POST",
    body: "x".repeat(100 * 1024 + 1),
  });
  check(
    "anonymous oversized login is rejected before forwarding",
    oversized.status === 413 && (await metrics()).loginCalls === loginBefore,
  );
  const valid = await fetch(`${origin}/api/backend/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "fixture", password: "fixture-only" }),
  });
  check(
    "valid public login still forwards",
    valid.status === 200 && (await metrics()).loginCalls === loginBefore + 1,
  );
  // Exercise the real AuthProvider through Account's password form.
  await p.click('document.querySelector(".kc-user-button")');
  await p.wait('document.querySelector(".account-menu-link")', "account link");
  await p.click('document.querySelector(".account-menu-link")');
  await p.wait(
    `document.querySelector('a[href="#security"]')`,
    "account navigation",
  );
  await p.click(`document.querySelector('a[href="#security"]')`);
  await p.wait(
    'document.querySelector("#security:not([hidden])")',
    "security section",
  );
  await p.click(button("Change password"));
  await p.field("#change-password-current", "wrong-fixture-password");
  await p.field("#change-password-new", "new-fixture-password");
  await p.field("#change-password-confirm", "new-fixture-password");
  const beforePassword = await metrics();
  await p.click(button("Update password"));
  await p.wait(
    'document.querySelector(".change-password-form [role=alert]")',
    "password rejection",
  );
  const afterPassword = await metrics();
  check(
    "wrong current password submits once without refreshing credentials",
    afterPassword.passwordCalls === beforePassword.passwordCalls + 1 &&
      afterPassword.refreshes === beforePassword.refreshes,
  );
  await p.click('document.querySelector(".account-security-back")');
  await p.wait(
    'document.querySelector("#route-name")',
    "Map return after native hash",
  );
  await p.field("#route-name", "Sign out draft");
  await p.click('document.querySelector(".kc-user-button")');
  await p.wait(
    'document.querySelector(".account-menu-logout")',
    "Sign out menu",
  );
  await p.click('document.querySelector(".account-menu-logout")');
  await p.wait(
    'document.querySelector("[role=alertdialog]")',
    "Sign out discard confirmation",
  );
  await p.click(dialogButton("Discard changes"));
  await p.wait(
    'location.pathname === "/login" && !localStorage.getItem("kestrel.web.session")',
    "confirmed Sign out",
  );
  check("confirmed Sign out clears the session and leaves Map", true);
  console.log("RUNTIME ERRORS", JSON.stringify(sessions.map((s) => s.errors)));
  check(
    "no application runtime exceptions",
    sessions.every((s) => s.errors.length === 0),
  );
  await writeFile(
    join(output, "results.json"),
    JSON.stringify(
      { checks: checkNames, errors: sessions.map((s) => s.errors) },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      passed: checkNames.length,
      errors: sessions.map((s) => s.errors),
      output,
    }),
  );
} finally {
  for (const p of sessions) await p.close().catch(() => {});
}
