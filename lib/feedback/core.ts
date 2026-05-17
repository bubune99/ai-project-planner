/**
 * Feedback capture core — framework-agnostic, zero-dependency.
 *
 * This is the extractable heart of the feedback widget. The React wrapper
 * (components/feedback/FeedbackWidget.tsx) and a future <script> build + npm
 * package all sit on top of this. Keep it DOM-only, no React, no imports.
 *
 * Techniques adapted from the Field Trip extension:
 *  - stable selector via a priority fallback chain (data-testid > id >
 *    aria-label > name > role+text > distinctive class > nth-of-type path)
 *  - overlay rendered fixed at z-index max, pointer-events toggled,
 *    capture-phase click interception that excludes our own UI
 *  - element screenshot via SVG <foreignObject> clone (no html2canvas dep)
 *  - environment snapshot incl. devicePixelRatio + app brand/density state
 */

export interface CapturedTarget {
  selector: string;
  selectorFallbacks: string[];
  rect: { x: number; y: number; w: number; h: number };
  snapshot: {
    tag: string;
    text: string;
    classes: string;
    attributes: Record<string, string>;
  };
  screenshot: string | null; // data URL (SVG)
}

export interface CapturedEnv {
  url: string;
  route: string;
  title: string;
  viewport: { w: number; h: number };
  scrollY: number;
  devicePixelRatio: number;
  userAgent: string;
  platform: string;
  deviceType: "mobile" | "tablet" | "desktop";
  colorScheme: "light" | "dark";
  brand: string | null;
  density: string | null;
  locale: string;
  timezone: string;
  commitSha: string | null;
}

const WIDGET_ATTR = "data-fbw"; // marks our own UI so we never annotate ourselves

// ── Selector generation ──────────────────────────────────────────────────────

function isUnique(sel: string): boolean {
  try {
    return document.querySelectorAll(sel).length === 1;
  } catch {
    return false;
  }
}

/** Build a primary selector + ordered fallbacks for an element. */
export function buildSelector(el: Element): { primary: string; fallbacks: string[] } {
  const cands: string[] = [];
  const esc = (s: string) => (window.CSS && CSS.escape ? CSS.escape(s) : s.replace(/[^\w-]/g, "\\$&"));

  const testid = el.getAttribute("data-testid");
  if (testid) cands.push(`[data-testid="${esc(testid)}"]`);
  if (el.id) cands.push(`#${esc(el.id)}`);
  const aria = el.getAttribute("aria-label");
  if (aria) cands.push(`${el.tagName.toLowerCase()}[aria-label="${esc(aria)}"]`);
  const name = el.getAttribute("name");
  if (name) cands.push(`${el.tagName.toLowerCase()}[name="${esc(name)}"]`);
  const role = el.getAttribute("role");
  const txt = (el.textContent || "").trim().slice(0, 40);
  if (role && txt) cands.push(`${el.tagName.toLowerCase()}[role="${esc(role)}"]`);
  // distinctive single class (skip utility/hashed classes)
  const cls = Array.from(el.classList).find(
    (c) => c.length > 3 && !/^(css-|sc-|[a-z]{1,3}-?\d)/.test(c) && !/^(flex|grid|p|m|w|h|text|bg)-/.test(c)
  );
  if (cls) cands.push(`${el.tagName.toLowerCase()}.${esc(cls)}`);

  const unique = cands.filter(isUnique);
  const anchored = anchoredPath(el);
  const primary = unique[0] || anchored;
  const fallbacks = Array.from(new Set([...unique.slice(1), anchored, ...cands])).filter(
    (s) => s && s !== primary
  );
  return { primary, fallbacks: fallbacks.slice(0, 4) };
}

/** Last-resort structural path using nth-of-type (robust to sibling inserts). */
function anchoredPath(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  let depth = 0;
  while (node && node.nodeType === 1 && node !== document.body && depth < 6) {
    let part = node.tagName.toLowerCase();
    if (node.id) {
      parts.unshift(`#${node.id}`);
      break;
    }
    const parent = node.parentElement;
    if (parent) {
      const sameTag = Array.from(parent.children).filter((c) => c.tagName === node!.tagName);
      if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
    }
    parts.unshift(part);
    node = node.parentElement;
    depth++;
  }
  return parts.join(" > ");
}

// ── Environment ──────────────────────────────────────────────────────────────

export function captureEnv(): CapturedEnv {
  const w = window.innerWidth;
  const deviceType = w < 640 ? "mobile" : w < 1024 ? "tablet" : "desktop";
  const root = document.documentElement;
  const brandEl = document.querySelector("[data-brand]") as HTMLElement | null;
  const commitMeta = document.querySelector('meta[name="commit-sha"]') as HTMLMetaElement | null;
  return {
    url: location.href,
    route: location.pathname,
    title: document.title,
    viewport: { w, h: window.innerHeight },
    scrollY: window.scrollY,
    devicePixelRatio: window.devicePixelRatio || 1,
    userAgent: navigator.userAgent,
    platform: (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
      ?.platform || navigator.platform || "",
    deviceType,
    colorScheme: window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light",
    brand: brandEl?.getAttribute("data-brand") || root.getAttribute("data-brand"),
    density: brandEl?.getAttribute("data-density") || root.getAttribute("data-density"),
    locale: navigator.language || "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    commitSha:
      commitMeta?.content ||
      (window as unknown as { __COMMIT_SHA__?: string }).__COMMIT_SHA__ ||
      null,
  };
}

// ── Screenshot (SVG foreignObject clone) ─────────────────────────────────────

const STYLE_PROPS = [
  "background", "background-color", "color", "border", "border-radius",
  "box-shadow", "font", "font-size", "font-weight", "font-family",
  "padding", "margin", "display", "opacity", "text-align", "line-height",
];

export async function captureScreenshot(el: Element): Promise<string | null> {
  try {
    const rect = el.getBoundingClientRect();
    const w = Math.min(Math.ceil(rect.width), 1200);
    const h = Math.min(Math.ceil(rect.height), 1200);
    if (w === 0 || h === 0) return null;
    const clone = el.cloneNode(true) as HTMLElement;
    const cs = getComputedStyle(el);
    clone.setAttribute(
      "style",
      STYLE_PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(";")
    );
    const xml = new XMLSerializer().serializeToString(clone);
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
      `<foreignObject width="100%" height="100%">` +
      `<div xmlns="http://www.w3.org/1999/xhtml">${xml}</div>` +
      `</foreignObject></svg>`;
    return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
  } catch {
    return null;
  }
}

// ── Select mode (hover highlight + capture-phase click) ──────────────────────

export interface SelectController {
  stop: () => void;
}

/**
 * Enter element-select mode. Highlights elements on hover and resolves the
 * picked target on click (suppressing the page's own handler). Our own widget
 * UI (marked with data-fbw) is excluded.
 */
export function startSelect(
  onPick: (target: CapturedTarget) => void,
  onCancel: () => void
): SelectController {
  const hl = document.createElement("div");
  hl.setAttribute(WIDGET_ATTR, "highlight");
  Object.assign(hl.style, {
    position: "fixed",
    pointerEvents: "none",
    zIndex: "2147483644",
    border: "2px solid #2563eb",
    background: "rgba(37,99,235,0.08)",
    borderRadius: "3px",
    transition: "all 60ms ease",
    inset: "auto",
  } as CSSStyleDeclaration);
  document.body.appendChild(hl);

  let current: Element | null = null;
  const isOwn = (n: EventTarget | null) =>
    n instanceof Element && !!n.closest(`[${WIDGET_ATTR}]`);

  const move = (e: MouseEvent) => {
    const t = e.composedPath().find((n) => n instanceof Element && !isOwn(n)) as
      | Element
      | undefined;
    if (!t || t === current) return;
    current = t;
    const r = t.getBoundingClientRect();
    Object.assign(hl.style, {
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
  };

  const click = async (e: MouseEvent) => {
    if (isOwn(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const el = current;
    if (!el) return;
    cleanup();
    const r = el.getBoundingClientRect();
    const sel = buildSelector(el);
    const attrs: Record<string, string> = {};
    for (const a of Array.from(el.attributes)) attrs[a.name] = a.value;
    onPick({
      selector: sel.primary,
      selectorFallbacks: sel.fallbacks,
      rect: { x: r.left, y: r.top, w: r.width, h: r.height },
      snapshot: {
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || "").trim().slice(0, 200),
        classes: el.className?.toString?.() || "",
        attributes: attrs,
      },
      screenshot: await captureScreenshot(el),
    });
  };

  const key = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      cleanup();
      onCancel();
    }
  };

  function cleanup() {
    window.removeEventListener("mousemove", move, true);
    window.removeEventListener("click", click, true);
    window.removeEventListener("keydown", key, true);
    hl.remove();
  }

  window.addEventListener("mousemove", move, true);
  window.addEventListener("click", click, true);
  window.addEventListener("keydown", key, true);
  return { stop: cleanup };
}

// ── Submit ───────────────────────────────────────────────────────────────────

export interface FeedbackPayload {
  source: string;
  projectId?: string | null;
  comment: string;
  title?: string;
  target: CapturedTarget | null;
  env: CapturedEnv;
}

export async function submitFeedback(
  payload: FeedbackPayload,
  endpoint = "/api/feedback"
): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        source: payload.source,
        projectId: payload.projectId ?? null,
        comment: payload.comment,
        title: payload.title || null,
        url: payload.env.url,
        route: payload.env.route,
        selector: payload.target?.selector || null,
        targetRect: payload.target?.rect || null,
        annotations: payload.target
          ? [{ snapshot: payload.target.snapshot, fallbacks: payload.target.selectorFallbacks }]
          : [],
        screenshot: payload.target?.screenshot || null,
        env: payload.env,
        commitSha: payload.env.commitSha,
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: j?.error?.message || j?.error || `HTTP ${res.status}` };
    return { ok: true, id: j?.data?.id || j?.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network error" };
  }
}
