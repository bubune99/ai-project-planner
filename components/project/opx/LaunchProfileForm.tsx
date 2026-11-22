"use client"

/*
 * The launch profile form of the Launch tab: launch type, traits, regions and
 * the two optional addresses, saved with PUT /api/projects/[id]/readiness.
 * The allowed launch types and traits are the keys of the word lists in
 * lib/readiness/view, which are tied to the model's own lists; the route
 * checks everything again and its message is shown as written.
 */

import { useId, useState } from "react"
import type { LaunchType, Profile } from "@/lib/readiness/model"
import { LAUNCH_TYPE_WORD, TRAIT_WORD, profileBody, type Trait } from "@/lib/readiness/view"

const TYPES = Object.keys(LAUNCH_TYPE_WORD) as LaunchType[]
const TRAITS = Object.keys(TRAIT_WORD) as Trait[]

export function LaunchProfileForm({ projectId, initial, onSaved, onCancel }: { projectId: string; initial: Profile | null; onSaved: () => void; onCancel?: () => void }) {
  const id = useId()
  const [launchType, setLaunchType] = useState<LaunchType | "">(initial?.launchType ?? "")
  const [traits, setTraits] = useState<string[]>(initial?.traits ?? [])
  const [regions, setRegions] = useState((initial?.regions ?? []).join(", "))
  const [domain, setDomain] = useState(initial?.domain ?? "")
  const [siteUrl, setSiteUrl] = useState(initial?.siteUrl ?? "")
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    if (!launchType) { setFailed("Choose a launch type first."); return }
    setSaving(true); setFailed(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/readiness`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileBody({ launchType, traits, regions, domain, siteUrl })),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) { setFailed(j?.error?.message || `Could not save the profile (HTTP ${res.status})`); return }
      onSaved()
    } catch {
      setFailed("Could not save the profile: the planner did not answer. Try again.")
    } finally {
      setSaving(false)
    }
  }

  const toggle = (t: string) => setTraits((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))

  return (
    <form className="opx-sec" onSubmit={save} aria-labelledby={`${id}-title`}>
      <div className="opx-sech"><h2 id={`${id}-title`}>Launch profile</h2></div>
      <p className="opx-ck-meta opx-muted">The launch type and the traits decide which checklist items apply to this project.</p>

      <div className="opx-sf">
        <label id={`${id}-type`}>Launch type</label>
        <div role="radiogroup" aria-labelledby={`${id}-type`} className="opx-row" style={{ flexWrap: "wrap" }}>
          {TYPES.map((t) => (
            <label key={t} className="opx-row" style={{ gap: 2 }}>
              <span className="opx-pick"><input type="radio" name={`${id}-type`} value={t} checked={launchType === t} onChange={() => setLaunchType(t)} /></span>
              {LAUNCH_TYPE_WORD[t]}
            </label>
          ))}
        </div>
      </div>

      <div className="opx-sf">
        <label id={`${id}-traits`}>Traits</label>
        <div>
          <div role="group" aria-labelledby={`${id}-traits`} className="opx-fgrid" style={{ marginTop: 0 }}>
            {TRAITS.map((t) => (
              <label key={t} className="opx-row" style={{ gap: 2 }}>
                <span className="opx-pick"><input type="checkbox" checked={traits.includes(t)} onChange={() => toggle(t)} /></span>
                {TRAIT_WORD[t]}
              </label>
            ))}
          </div>
          <small>Tick what the project has or does. An item that needs a trait applies only when it is ticked.</small>
        </div>
      </div>

      <div className="opx-sf">
        <label htmlFor={`${id}-regions`}>Regions</label>
        <div>
          <input id={`${id}-regions`} className="opx-input" value={regions} onChange={(e) => setRegions(e.target.value)} placeholder="US, US-CA" autoComplete="off" />
          <small>Separate with commas. Left empty, it is saved as US.</small>
        </div>
      </div>

      <div className="opx-sf">
        <label htmlFor={`${id}-domain`}>Domain</label>
        <div>
          <input id={`${id}-domain`} className="opx-input" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" autoComplete="off" />
          <small>Optional.</small>
        </div>
      </div>

      <div className="opx-sf">
        <label htmlFor={`${id}-site`}>Site address</label>
        <div>
          <input id={`${id}-site`} className="opx-input" type="url" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} placeholder="https://example.com" autoComplete="off" />
          <small>Optional. It must start with https://.</small>
        </div>
      </div>

      {failed && <p role="alert" className="opx-ch-need">{failed}</p>}
      <div className="opx-row" style={{ marginTop: 12, flexWrap: "wrap" }}>
        <button type="submit" className="opx-btn primary" disabled={saving}>{saving ? "Saving the profile…" : "Save the launch profile"}</button>
        {onCancel && <button type="button" className="opx-btn" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  )
}
