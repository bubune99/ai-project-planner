import { toWidget } from "./widgets"
let pass = 0, fail = 0
const eq = (m: string, a: unknown, b: unknown) => { JSON.stringify(a) === JSON.stringify(b) ? pass++ : (fail++, console.log("FAIL", m, JSON.stringify(a), JSON.stringify(b))) }

eq("error text -> none", toWidget("my_work", "Error: nope"), null)
eq("not json -> none", toWidget("my_work", "hello"), null)
eq("unknown tool -> none", toWidget("create_todo", '{"id":"x"}'), null)

const mw = { myTodos: [{ id: "t1", status: "open", priority: "high", due: "2026-10-01", overdue: true, untrusted_title: "File taxes", untrusted_project: "Home" }], unassignedOpenSteps: [] }
eq("my_work todos", toWidget("my_work", JSON.stringify(mw)), { kind: "todos", title: "Your open todos", items: [{ id: "t1", title: "File taxes", due: "2026-10-01", overdue: true, project: "Home", priority: "high" }], more: 0 })

const mw2 = { myTodos: [], unassignedOpenSteps: [{ id: "s1", projectId: "p1", untrusted_project: "Site", untrusted_title: "Write copy" }] }
eq("my_work steps", toWidget("my_work", JSON.stringify(mw2))?.kind, "steps")
eq("my_work empty", toWidget("my_work", JSON.stringify({ myTodos: [], unassignedOpenSteps: [] })), null)

const many = { myTodos: Array.from({ length: 9 }, (_, i) => ({ id: `t${i}`, untrusted_title: `T${i}` })) }
const w = toWidget("my_work", JSON.stringify(many))
eq("capped at 6", w && "items" in w ? w.items.length : -1, 6)
eq("more counted", w && "more" in w ? w.more : -1, 3)

eq("list_todos drops completed", toWidget("list_todos", JSON.stringify({ todos: [{ id: "a", title: "x", status: "completed" }] })), null)
eq("list_todos project object", (toWidget("list_todos", JSON.stringify({ todos: [{ id: "a", title: "x", status: "open", project: { id: "p", name: "Alpha" } }] })) as { items: { project: string }[] }).items[0].project, "Alpha")

const cu = { projects: [{ projectId: "p1", untrusted_projectName: "Dzidzor", summary: "3 tasks changed", highlights: [{ untrusted_title: "Hero copy", detail: "completed" }] }], quietProjects: 2 }
eq("catch_me_up", toWidget("catch_me_up", JSON.stringify(cu)), { kind: "catchup", title: "What changed", items: [{ projectId: "p1", name: "Dzidzor", summary: "3 tasks changed", highlights: ["Hero copy"] }], quiet: 2 })

eq("list_projects", toWidget("list_projects", JSON.stringify({ projects: [{ id: "p1", name: "A", status: "active" }] })), { kind: "projects", title: "Projects", items: [{ id: "p1", name: "A", status: "active" }], more: 0 })

const long = toWidget("my_work", JSON.stringify({ myTodos: [{ id: "x", untrusted_title: "a".repeat(300) }] })) as { items: { title: string }[] }
eq("titles clipped", long.items[0].title.length <= 90, true)
eq("show_unit point", toWidget("show_unit", JSON.stringify({ ok: true, key: "chat.history", shown: "Chat history", mode: "spotlight", caption: "Here" })), { kind: "point", key: "chat.history", label: "Chat history", mode: "spotlight", caption: "Here" })
eq("show_unit not found", toWidget("show_unit", JSON.stringify({ ok: false, error: "x" })), null)
eq("show_unit dynamic ask", toWidget("show_unit", JSON.stringify({ ok: true, ask: "Add task", shown: "Add task", mode: "highlight", caption: "" })), { kind: "point", ask: "Add task", label: "Add task", mode: "highlight", caption: "" })
eq("go_to navigate", toWidget("go_to", JSON.stringify({ ok: true, path: "/inbox", label: "Inbox" })), { kind: "navigate", path: "/inbox", label: "Inbox" })
eq("go_to refuses protocol-relative", toWidget("go_to", JSON.stringify({ ok: true, path: "//evil.com", label: "x" })), null)
eq("go_to refuses absolute url", toWidget("go_to", JSON.stringify({ ok: true, path: "https://evil.com", label: "x" })), null)
eq("go_to failure", toWidget("go_to", JSON.stringify({ ok: false, error: "no" })), null)
console.log(`widgets.assert: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
