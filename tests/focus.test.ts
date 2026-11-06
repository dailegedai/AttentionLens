import assert from "node:assert/strict";
import test from "node:test";

class FakeStyle {
  private readonly values = new Map<string, { value: string; priority: string }>();

  getPropertyValue(name: string): string {
    return this.values.get(name)?.value ?? "";
  }

  getPropertyPriority(name: string): string {
    return this.values.get(name)?.priority ?? "";
  }

  setProperty(name: string, value: string, priority = ""): void {
    this.values.set(name, { value, priority });
  }

  removeProperty(name: string): void {
    this.values.delete(name);
  }
}

class FakeElement {
  id = "";
  textContent = "";
  isConnected = true;
  parent: FakeElement | null = null;
  children: FakeElement[] = [];
  readonly style = new FakeStyle();
  private readonly classes = new Set<string>();
  readonly classList = {
    add: (name: string) => {
      this.classes.add(name);
    },
    remove: (name: string) => {
      this.classes.delete(name);
    },
    contains: (name: string) => this.classes.has(name),
  };

  append(child: FakeElement): void {
    child.parent = this;
    child.isConnected = true;
    this.children.push(child);
  }

  remove(): void {
    if (this.parent) {
      this.parent.children = this.parent.children.filter((child) => child !== this);
    }
    this.parent = null;
    this.isConnected = false;
  }
}

function installFakeDom(): { html: FakeElement; body: FakeElement } {
  const html = new FakeElement();
  const body = new FakeElement();
  html.append(body);

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      body,
      documentElement: html,
      createElement: () => new FakeElement(),
      getElementById: (id: string) => html.children.find((child) => child.id === id) ?? null,
    },
  });

  return { html, body };
}

test("focus mode hides via inline CSSOM and restores the original display", async () => {
  const { html, body } = installFakeDom();
  const { enterFocusMode, exitFocusMode, getHiddenCount, isFocusMode } = await import(
    "../src/content/focus.ts"
  );
  const banner = new FakeElement();
  banner.style.setProperty("display", "flex");
  body.append(banner);
  const element = banner as unknown as HTMLElement;

  assert.equal(enterFocusMode([element]), 1);
  assert.equal(isFocusMode(), true);
  assert.equal(getHiddenCount(), 1);
  assert.ok(banner.classList.contains("attention-lens-hidden"));
  assert.equal(banner.style.getPropertyValue("display"), "none");
  assert.equal(banner.style.getPropertyPriority("display"), "important");
  assert.equal(html.children.length, 1, "focus mode must not inject a style element");

  exitFocusMode();

  assert.equal(isFocusMode(), false);
  assert.equal(getHiddenCount(), 0);
  assert.equal(banner.classList.contains("attention-lens-hidden"), false);
  assert.equal(banner.style.getPropertyValue("display"), "flex");
});

test("focus mode never hides the body or document root", async () => {
  const { html, body } = installFakeDom();
  const { enterFocusMode, exitFocusMode } = await import("../src/content/focus.ts");
  const distraction = new FakeElement();

  const count = enterFocusMode([
    body as unknown as HTMLElement,
    html as unknown as HTMLElement,
    distraction as unknown as HTMLElement,
  ]);

  assert.equal(count, 1);
  assert.equal(distraction.classList.contains("attention-lens-hidden"), true);
  assert.equal(body.style.getPropertyValue("display"), "");
  exitFocusMode();
});
