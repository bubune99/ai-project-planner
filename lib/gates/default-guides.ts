/**
 * The starting set of guides: the stack the owner named on 2026-11-13, and the
 * taste statements they have already given. Installing them is idempotent (by
 * name). Statements are a starting structure: the owner adjusts them over time.
 */
import type { Guide } from "./guides"

type Seed = Omit<Guide, "id">
const STACK_BASIS = "Owner, 2026-11-13: named as part of the stack we build with."

export const DEFAULT_GUIDES: Seed[] = [
  {
    kind: "stack", name: "Next.js", summary: "App Router. Thin pages; rules live in pure modules under lib with a check file beside them.", skill: "vercel:nextjs",
    applies: { files: ["app/**/*.{ts,tsx}"] }, status: "active", source: "owner", basis: STACK_BASIS,
    checks: [
      { id: "staging", say: "Verified on the staging deployment, on a build newer than the commit. No dev server on this machine" },
      { id: "thin", say: "The page file holds no business rule: anything that decides something is in lib and has a check" },
    ],
  },
  {
    kind: "stack", name: "Vercel", summary: "Hosting and deploys. Staging is deployed by hand and its address moved to the new build; production follows main.", skill: "vercel:deployments-cicd",
    applies: { files: ["vercel.json", "vercel.ts", "next.config.*", "middleware.ts"] }, status: "active", source: "owner", basis: STACK_BASIS,
    checks: [
      { id: "newer", say: "The deployment under test was created after the commit (vercel inspect), and the staging address points at it" },
      { id: "prod-go", say: "A production deploy or a change to security headers waits for the owner's go" },
    ],
  },
  {
    kind: "stack", name: "Cloudflare R2", summary: "File storage. Every upload goes through a route that checks who owns the thing it belongs to.", skill: "cloudflare:cloudflare",
    applies: { imports: ["@aws-sdk/client-s3", "@/lib/storage/r2-client"] }, status: "active", source: "owner", basis: STACK_BASIS,
    checks: [
      { id: "owner-check", say: "The upload and download paths check that the caller may reach the project the file belongs to" },
      { id: "cleanup", say: "When the record is deleted, the stored file is deleted too, and there is a rule for how long files are kept" },
    ],
  },
  {
    kind: "stack", name: "Stripe", summary: "Payments. Test mode first; webhooks prove who sent them; prices and billing are the owner's call.", skill: "stripe:stripe-best-practices",
    applies: { imports: ["stripe", "@stripe"] }, status: "active", source: "owner", basis: STACK_BASIS,
    checks: [
      { id: "test-run", say: "The whole flow was run in test mode with a test card, including a declined card" },
      { id: "webhook", say: "A webhook handler verifies the signature before trusting the event, and handling the same event twice does no harm" },
      { id: "owner", say: "Anything that changes a price, a plan or what a customer is charged was approved by the owner" },
    ],
  },
  {
    kind: "stack", name: "Hexclave", summary: "Sign-in. Sessions belong to one domain, so only the stable staging address is signed in.",
    applies: { imports: ["@stackframe", "@hexclave", "@/lib/auth"] }, status: "active", source: "owner", basis: STACK_BASIS,
    checks: [
      { id: "refused", say: "A signed-out request is refused, and a signed-in person cannot reach another person's data" },
      { id: "looser", say: "Nothing here makes access looser or declares a route public without the owner's answer" },
    ],
  },
  {
    kind: "stack", name: "React Flow", summary: "Canvases and graphs (@xyflow/react).",
    applies: { imports: ["@xyflow/react", "reactflow"] }, status: "active", source: "owner", basis: STACK_BASIS,
    checks: [
      { id: "node-types", say: "Node and edge type maps are defined outside the component or memoized, so the canvas does not rebuild on every render" },
      { id: "use-it", say: "In a visible window: pan, zoom, select and drag a node, and the canvas keeps up with a realistic number of nodes" },
    ],
  },
  {
    kind: "stack", name: "shadcn/ui and Radix", summary: "Building blocks for controls. Radix composes names and focus at run time, so they are checked in the page, not the source.", skill: "vercel:shadcn",
    applies: { imports: ["@radix-ui", "@/components/ui"] }, status: "active", source: "owner", basis: STACK_BASIS,
    checks: [
      { id: "names", say: "Every field and icon-only button has a name a screen reader can read, checked in the rendered page" },
      { id: "esc", say: "Menus and dialogs close with Esc and put focus back where it was" },
    ],
  },
  {
    kind: "stack", name: "Zustand", summary: "Client state.",
    applies: { imports: ["zustand"] }, status: "active", source: "owner", basis: STACK_BASIS,
    checks: [
      { id: "new-objects", say: "State is updated by returning new objects, never by changing the old one in place" },
      { id: "select", say: "Components select only the pieces they use, so one change does not redraw everything" },
    ],
  },
  // ── Statements: taste. A starting structure, to be adjusted. ──
  {
    kind: "statement", name: "No monospace type", summary: "No monospace font anywhere, including small labels and code-like values.",
    applies: { files: ["**/*.{tsx,jsx,css}"] }, status: "active", source: "owner", basis: "Owner, 2026-10-24: eradicate monospace in all projects, including small labels.",
    checks: [{ id: "none", say: "No monospace font is used", auto: "forbids:font-mono|font-family:[^;]*mono|ui-monospace" }],
  },
  {
    kind: "statement", name: "Icons, not emoji", summary: "No emoji used as icons. Use an icon from the icon set, or plain text.",
    applies: { files: ["**/*.{tsx,jsx,css}"] }, status: "active", source: "owner", basis: "Owner, 2026-11-13: no emoji as icons anywhere.",
    checks: [{ id: "none", say: "No emoji used as an icon", auto: "no-emoji" }],
  },
  {
    kind: "statement", name: "No colored side-stripes", summary: "A selected row or card is shown with a tint, never a colored strip down its side.",
    applies: { files: ["**/*.{tsx,jsx,css}"] }, status: "active", source: "owner", basis: "Owner, 2026-10-24: the colored left strip on selected rows and cards is forbidden.",
    checks: [{ id: "none", say: "No colored strip marks a selected row or card", auto: "forbids:border-l-[2-8]\\b|border-left:\\s*[2-8]px\\s+solid" }],
  },
  {
    kind: "statement", name: "US English", summary: "All text people read is in US spelling.",
    applies: { files: ["**/*.{tsx,jsx}"] }, status: "active", source: "owner", basis: "Owner, 2026-10: he is in the US: color, favorite, personalize.",
    checks: [{ id: "spelling", say: "No British spellings in text people read", auto: "forbids:\\b(colour|favourite|personalis|organis|customis|centre|cancelled)" }],
  },
  {
    kind: "statement", name: "Lists, not rows of chips", summary: "Many options are shown as a plain list or something that scrolls, not a wall of chips.",
    applies: { files: ["{components,app}/**/*.tsx"] }, status: "active", source: "owner", basis: "Owner, 2026-11-13: I don't like excessive chips. Either some type of list or scroll option.",
    checks: [{ id: "chips", say: "Where there are more than a handful of options, they are a list or a scroller, not chips" }],
  },
  {
    kind: "statement", name: "Use the width, no dead space", summary: "A screen fills the width it has. Opening something never leaves a large empty area.",
    applies: { files: ["{components,app}/**/*.tsx"] }, status: "active", source: "owner", basis: "Owner, 2026-10-24 and 2026-11-13: use the width; too much negative space.",
    checks: [{ id: "wide", say: "Looked at on a very wide screen and at phone width: no large empty area, nothing squeezed into a corner" }],
  },
  {
    kind: "statement", name: "Dark by default, light kept", summary: "The dark theme is the default; the light theme still works.",
    applies: { files: ["{components,app}/**/*.tsx", "**/*.css"] }, status: "active", source: "owner", basis: "Owner, 2026-11-13: dark by default with light kept.",
    checks: [{ id: "both", say: "Checked in both themes: every piece of text is readable and nothing uses a color that only works in one" }],
  },
  {
    kind: "statement", name: "What opens, closes the usual ways", summary: "A menu, dialog or panel closes when something in it is chosen, when anything outside it is pressed, and with Esc.",
    applies: { files: ["{components,app}/**/*.tsx"] }, status: "active", source: "owner", basis: "Owner, 2026-11-14, on the process map: when I right click I can't do a regular click to get out of the right click menu.",
    checks: [{ id: "three-ways", say: "Opened it and closed it three ways in the running page: by choosing an item, by pressing outside it (on empty space and on another control), and with Esc" }],
  },
  {
    kind: "statement", name: "An editor is complete", summary: "Wherever things are built or arranged, every kind of thing shown can be added, changed, moved and removed, something can be put in between two others, moving keeps things lined up, and any change can be undone.",
    applies: { files: ["{components,app}/**/*.tsx"] }, status: "active", source: "owner", basis: "Owner, 2026-11-14, on the process map: I don't know how to add a new swim lane or a module, ability to interject, auto alignment features. The whole nine.",
    checks: [
      { id: "every-kind", say: "Listed every kind of thing the editor shows, and for each one added, changed, moved and removed it in the running page" },
      { id: "between", say: "Put something in between two existing things, and what joined them stayed joined through it" },
      { id: "lined-up", say: "Moved something and it landed lined up, with its connections still true" },
      { id: "undo", say: "Undid and redid a change of each sort" },
    ],
  },
  {
    kind: "statement", name: "Every action can be found", summary: "Anything a person can do is reachable from something visible. A right-click menu or a shortcut is a second way in, never the only one.",
    applies: { files: ["{components,app}/**/*.tsx"] }, status: "active", source: "owner", basis: "Owner, 2026-11-14, on the process map: I don't know how to add a new swim lane or a module.",
    checks: [{ id: "visible", say: "For each action, named the visible control that leads to it; anything reachable only by right-click, hover or a key is listed and justified" }],
  },
  {
    kind: "statement", name: "Show the real thing", summary: "Never invent a number, a date or a piece of content. Show a dash when nothing was entered.",
    applies: { files: ["{components,app,lib}/**/*.{ts,tsx}"] }, status: "active", source: "owner", basis: "Owner, 2026-10-24: represent the real, don't invent.",
    checks: [{ id: "real", say: "Every number and date on the screen traces to stored data; an empty value shows a dash, not a made-up one" }],
  },
]
