"use client"

import { useEffect, useState } from "react"

/**
 * Subscribe to a CSS media query.
 *
 * Returns false on the server and on the first client render, then the real
 * value after mount. That ordering matters: reading matchMedia during render
 * would make the server and client markup disagree and trip hydration.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return

    const mql = window.matchMedia(query)
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches)

    setMatches(mql.matches)

    // Safari < 14 only has the deprecated addListener/removeListener pair.
    if (mql.addEventListener) {
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    }
    mql.addListener(onChange)
    return () => mql.removeListener(onChange)
  }, [query])

  return matches
}
