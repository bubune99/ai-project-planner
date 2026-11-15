// npx -y tsx@4.23.15 lib/ui/which-site.assert.ts
import assert from "node:assert/strict"
import { whichSite } from "./which-site"

assert.equal(whichSite("v0-ai-project-planner-eight.vercel.app"), "production")
assert.equal(whichSite("V0-AI-Project-Planner-Eight.vercel.app."), "production")
assert.equal(whichSite("v0-ai-project-planner-git-staging-far-grace.vercel.app"), "staging")
assert.equal(whichSite("v0-ai-project-planner-ek0gk76av-far-grace.vercel.app"), "preview")
assert.equal(whichSite("localhost"), "local")
// An address we do not know is never called "not live".
assert.equal(whichSite("planner.example.com"), "production")
assert.equal(whichSite(""), "production")
console.log("which-site: 7 checks passed")
