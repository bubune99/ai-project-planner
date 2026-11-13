/**
 * Safe rehype plugin list for rendering MODEL OUTPUT with Streamdown.
 *
 * Streamdown 1.6.x's defaults are unsafe for untrusted text:
 *   - `raw`    = rehype-raw, which turns raw HTML in the markdown into real
 *                elements (<iframe srcdoc>, <form action>, <object>, ...).
 *   - `harden` = rehype-harden with wildcard link/image prefixes, every
 *                protocol allowed, and data: images allowed.
 * Model text can carry attacker-authored content (shared library items,
 * collaborators' data, fetched pages), so raw HTML must never become DOM.
 *
 * This list:
 *   1. drops `raw` and instead turns raw-HTML nodes into plain text, so the
 *      markup is shown literally (escaped by React) rather than rendered;
 *   2. keeps `katex` (math);
 *   3. re-configures `harden` so links/images are http(s) only (plus the
 *      harden built-ins mailto:/irc:/xmpp:/blob:), no custom protocols, no
 *      data: images. javascript:/data:/vbscript:/file: are always blocked.
 */

import type { ComponentProps } from "react"
import { defaultRehypePlugins, type Streamdown } from "streamdown"

type PluggableList = NonNullable<ComponentProps<typeof Streamdown>["rehypePlugins"]>
type Pluggable = PluggableList[number]

type HastLike = { type: string; value?: unknown; children?: HastLike[] }

/** Replace every hast `raw` node with a `text` node carrying the same source. */
export function rawHtmlToText(tree: HastLike): void {
  const children = tree.children
  if (!Array.isArray(children)) return
  for (let i = 0; i < children.length; i++) {
    const node = children[i]
    if (node && node.type === "raw") {
      children[i] = { type: "text", value: String(node.value ?? "") }
    } else if (node) {
      rawHtmlToText(node)
    }
  }
}

/** unified plugin wrapper for rawHtmlToText. */
export function rehypeRawToText() {
  return (tree: HastLike) => rawHtmlToText(tree)
}

function hardenPlugin(): Pluggable {
  const entry = defaultRehypePlugins.harden
  const fn = Array.isArray(entry) ? entry[0] : entry
  return [
    fn,
    {
      allowedLinkPrefixes: ["*"],
      allowedImagePrefixes: ["*"],
      allowedProtocols: [],
      allowDataImages: false,
      defaultOrigin: undefined,
    },
  ] as Pluggable
}

export const safeRehypePlugins: PluggableList = [
  rehypeRawToText,
  defaultRehypePlugins.katex,
  hardenPlugin(),
]
