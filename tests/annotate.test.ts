import assert from "node:assert/strict";
import test from "node:test";

import { collectFocusTargets, resolveRegions } from "../src/content/annotate.ts";
import type {
  AnalysisResult,
  BlockFeature,
  DetectionReport,
  DetectorResult,
  PollutionKind,
  PollutionResult,
} from "../src/types/index.ts";
import { makeFeatures } from "./fixtures.ts";

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

interface FakeElementOptions {
  id?: string;
  className?: string;
  text?: string;
  position?: string;
}

class FakeElement {
  readonly tagName: string;
  id = "";
  className = "";
  textContent = "";
  display = "block";
  position = "static";
  isConnected = true;
  parentElement: FakeElement | null = null;
  readonly children: FakeElement[] = [];
  readonly style = new FakeStyle();
  private readonly attributes = new Map<string, string>();
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

  constructor(tagName: string, options: FakeElementOptions = {}) {
    this.tagName = tagName.toUpperCase();
    this.id = options.id ?? "";
    this.className = options.className ?? "";
    this.textContent = options.text ?? "";
    this.position = options.position ?? "static";
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  append(...nodes: FakeElement[]): void {
    for (const node of nodes) {
      node.parentElement = this;
      node.isConnected = true;
      this.children.push(node);
    }
  }

  contains(other: FakeElement): boolean {
    let current: FakeElement | null = other;
    while (current) {
      if (current === this) return true;
      current = current.parentElement;
    }
    return false;
  }

  closest(selector: string): FakeElement | null {
    let current: FakeElement | null = this;
    while (current) {
      if (current.matches(selector)) return current;
      current = current.parentElement;
    }
    return null;
  }

  matches(selector: string): boolean {
    return selector.split(",").some((part) => this.matchesSimple(part.trim()));
  }

  querySelectorAll(selector: string): FakeElement[] {
    const results: FakeElement[] = [];
    const visit = (node: FakeElement): void => {
      for (const child of node.children) {
        if (selector === "*" || child.matches(selector)) results.push(child);
        visit(child);
      }
    };
    visit(this);
    return results;
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  getBoundingClientRect(): DOMRect {
    return { width: 200, height: 60, left: 0, top: 0, right: 200, bottom: 60, x: 0, y: 0 } as DOMRect;
  }

  private matchesSimple(selector: string): boolean {
    if (selector.startsWith("#")) return this.id === selector.slice(1);

    const classMatch = /^\[class\*="(.+)"\]$/.exec(selector);
    if (classMatch) return this.className.includes(classMatch[1]);

    const attributeMatch = /^\[([a-z-]+)="(.+)"\]$/.exec(selector);
    if (attributeMatch) return this.getAttribute(attributeMatch[1]) === attributeMatch[2];

    return this.tagName.toLowerCase() === selector;
  }
}

function installFakeDom(): {
  body: FakeElement;
  register: (domPath: string, element: FakeElement) => void;
} {
  const html = new FakeElement("html");
  const body = new FakeElement("body");
  html.append(body);
  const registry = new Map<string, FakeElement>();

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      body,
      documentElement: html,
      createElement: (tag: string) => new FakeElement(tag),
      getElementById: (id: string) =>
        html.querySelectorAll("*").find((element) => element.id === id) ?? null,
      querySelector: (selector: string) =>
        registry.get(selector) ?? body.querySelector(selector) ?? html.querySelector(selector),
      querySelectorAll: (selector: string) => body.querySelectorAll(selector),
    },
  });

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      getComputedStyle: (element: FakeElement) => ({
        display: element.display,
        position: element.position,
      }),
    },
  });

  Object.defineProperty(globalThis, "HTMLElement", {
    configurable: true,
    value: FakeElement,
  });

  return { body, register: (domPath, element) => registry.set(domPath, element) };
}

function makeBlock(overrides: Partial<BlockFeature> & { domPath: string }): BlockFeature {
  return {
    id: "block",
    tag: "div",
    selectorHint: "div",
    text: "",
    textLength: 100,
    linkCount: 0,
    linkDensity: 0,
    imageCount: 0,
    buttonCount: 0,
    headingCount: 0,
    position: "static",
    inViewport: true,
    rect: { x: 0, y: 0, width: 200, height: 60 },
    signals: [],
    ...overrides,
  };
}

function emptyDetectors(): DetectionReport {
  const kinds: PollutionKind[] = [
    "recommendation",
    "advertisement",
    "clickbait",
    "cta",
    "uiDistraction",
  ];
  const report = {} as Record<PollutionKind, DetectorResult>;

  for (const kind of kinds) {
    report[kind] = { kind, score: 0, count: 0, reasons: [], evidence: [] };
  }

  return report as DetectionReport;
}

function makeAnalysis(blocks: BlockFeature[]): AnalysisResult {
  const pollution: PollutionResult = {
    recommendation: 0,
    advertisement: 0,
    clickbait: 0,
    cta: 0,
    uiDistraction: 0,
    attentionCost: 0,
  };

  return {
    features: makeFeatures({ candidateBlocks: blocks }),
    detectors: emptyDetectors(),
    pollution,
    severity: "low",
    primaryReasons: [],
  };
}

test("docs-style pages keep the article and hide chrome without hiding main", () => {
  const { body, register } = installFakeDom();

  const navbar = new FakeElement("div", { id: "navbar", className: "navbar", position: "fixed" });
  const layout = new FakeElement("div", { id: "layout" });
  const sidebarColumn = new FakeElement("div", { id: "sidebar-column" });
  const sidebar = new FakeElement("nav", { id: "sidebar", text: "Get Started TS for the New Programmer" });
  const docMain = new FakeElement("main", { id: "doc-main" });
  const article = new FakeElement("article", {
    id: "doc",
    text: "About this Handbook Over 20 years after its introduction",
  });
  const toc = new FakeElement("nav", { id: "toc", text: "On this page About this Handbook" });
  const footer = new FakeElement("footer", { id: "site-footer" });
  const footerSection = new FakeElement("section", { id: "footer-bottom", text: "Made with love" });

  body.append(navbar, layout, footer);
  layout.append(sidebarColumn, docMain);
  sidebarColumn.append(sidebar);
  docMain.append(article, toc);
  footer.append(footerSection);

  register("body > div:nth-of-type(1)", navbar);
  register("body > div:nth-of-type(2)", layout);
  register("body > div:nth-of-type(2) > div:nth-of-type(1)", sidebarColumn);
  register("body > div:nth-of-type(2) > div:nth-of-type(1) > nav:nth-of-type(1)", sidebar);
  register("body > div:nth-of-type(2) > main:nth-of-type(1)", docMain);
  register(
    "body > div:nth-of-type(2) > main:nth-of-type(1) > article:nth-of-type(1)",
    article,
  );
  register("body > div:nth-of-type(2) > main:nth-of-type(1) > nav:nth-of-type(2)", toc);
  register("body > footer:nth-of-type(1)", footer);
  register("body > footer:nth-of-type(1) > section:nth-of-type(1)", footerSection);

  const analysis = makeAnalysis([
    makeBlock({
      id: "navbar",
      tag: "div",
      domPath: "body > div:nth-of-type(1)",
      position: "fixed",
      signals: ["position_fixed"],
      textLength: 120,
    }),
    makeBlock({
      id: "sidebar",
      tag: "nav",
      domPath: "body > div:nth-of-type(2) > div:nth-of-type(1) > nav:nth-of-type(1)",
      linkCount: 40,
      linkDensity: 0.9,
      signals: ["link_dense", "many_links"],
      textLength: 1500,
    }),
    makeBlock({
      id: "doc-main",
      tag: "main",
      domPath: "body > div:nth-of-type(2) > main:nth-of-type(1)",
      linkCount: 12,
      linkDensity: 0.45,
      headingCount: 8,
      signals: ["many_links", "heading_with_links"],
      textLength: 5200,
    }),
    makeBlock({
      id: "doc",
      tag: "article",
      domPath: "body > div:nth-of-type(2) > main:nth-of-type(1) > article:nth-of-type(1)",
      linkCount: 14,
      linkDensity: 0.5,
      headingCount: 6,
      signals: ["many_links", "heading_with_links"],
      textLength: 5000,
    }),
    makeBlock({
      id: "toc",
      tag: "nav",
      domPath: "body > div:nth-of-type(2) > main:nth-of-type(1) > nav:nth-of-type(2)",
      linkCount: 10,
      linkDensity: 0.8,
      signals: ["link_dense"],
      textLength: 200,
    }),
    makeBlock({
      id: "footer-bottom",
      tag: "section",
      domPath: "body > footer:nth-of-type(1) > section:nth-of-type(1)",
      linkCount: 20,
      linkDensity: 0.7,
      signals: ["link_dense", "many_links"],
      textLength: 400,
    }),
  ]);

  const regions = resolveRegions(analysis) as unknown as Array<{
    element: FakeElement;
    kind: string;
  }>;
  assert.ok(regions.some((region) => region.kind === "mainContent" && region.element === article));
  assert.ok(!regions.some((region) => region.element === docMain));
  assert.ok(!regions.some((region) => region.element === article && region.kind !== "mainContent"));

  const targets = collectFocusTargets(analysis) as unknown as FakeElement[];

  assert.ok(targets.includes(navbar), "navbar should be hidden");
  assert.ok(targets.includes(sidebarColumn), "sidebar column should be hidden instead of its nav");
  assert.ok(targets.includes(toc), "table of contents should be hidden");
  assert.ok(!targets.includes(article), "main article must never be hidden");
  assert.ok(!targets.includes(docMain), "main wrapper must never be hidden");
  assert.ok(!targets.includes(footerSection), "footer must not be hidden");
});
