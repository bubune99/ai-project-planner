import { MAX_UPLOAD_BYTES, downloadDisposition, extensionFor, storageKeyFor, uploadRefusal } from "./upload-rules"

let pass = 0, fail = 0
const eq = (m: string, a: unknown, b: unknown) => { a === b ? pass++ : (fail++, console.log("FAIL", m, a, b)) }

const USER = "11111111-1111-4111-8111-111111111111"
const PROJECT = "22222222-2222-4222-8222-222222222222"
const ID = "33333333-3333-4333-8333-333333333333"

// The extension comes from the allowed type, never from the name the browser sent.
eq("pdf", extensionFor("application/pdf"), "pdf")
eq("jpeg", extensionFor("image/jpeg"), "jpg")
eq("svg", extensionFor("image/svg+xml"), "svg")
eq("xlsx", extensionFor("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), "xlsx")
eq("html is not allowed", extensionFor("text/html"), null)
eq("unknown", extensionFor("application/octet-stream"), null)
eq("empty", extensionFor(""), null)
eq("a type with parameters is not on the list", extensionFor("text/plain; charset=utf-8"), null)
eq("prototype keys are not types", extensionFor("constructor"), null)

// The stored name is made here: nothing of the sender's file name reaches the key.
eq("key", storageKeyFor(USER, PROJECT, "application/pdf", ID), `users/${USER}/projects/${PROJECT}/${ID}.pdf`)
eq("key for a picture", storageKeyFor(USER, PROJECT, "image/png", ID), `users/${USER}/projects/${PROJECT}/${ID}.png`)
eq("no key for a type off the list", storageKeyFor(USER, PROJECT, "text/html", ID), null)
eq("no key for a project id that is not an id", storageKeyFor(USER, "../../other", "image/png", ID), null)
eq("no key for a user id that is not an id", storageKeyFor("me/..", PROJECT, "image/png", ID), null)
eq("no key for a file id that is not an id", storageKeyFor(USER, PROJECT, "image/png", "evil.php"), null)

// What is refused, in the order it is checked.
eq("fine", uploadRefusal({ type: "image/png", size: 10 }), null)
eq("type", uploadRefusal({ type: "text/html", size: 10 }), "Invalid file type: text/html. Allowed types: images, PDFs, spreadsheets, documents.")
eq("a strange type is cut at 100 characters", uploadRefusal({ type: "x".repeat(300), size: 10 }), `Invalid file type: ${"x".repeat(100)}. Allowed types: images, PDFs, spreadsheets, documents.`)
eq("too large", uploadRefusal({ type: "image/png", size: MAX_UPLOAD_BYTES + 1 }), "File too large. Maximum size is 50MB.")
eq("exactly the limit", uploadRefusal({ type: "image/png", size: MAX_UPLOAD_BYTES }), null)
eq("empty file", uploadRefusal({ type: "image/png", size: 0 }), "The file is empty.")
eq("size not a number", uploadRefusal({ type: "image/png", size: NaN }), "The file is empty.")

// A download keeps the name the person gave the file, made safe for a header; the extension is the stored one.
const KEY = `users/${USER}/projects/${PROJECT}/${ID}.pdf`
eq("plain name", downloadDisposition("Quarterly plan.pdf", KEY), `inline; filename="Quarterly plan.pdf"; filename*=UTF-8''Quarterly%20plan.pdf`)
eq("the stored extension wins", downloadDisposition("report.html", KEY), `inline; filename="report.pdf"; filename*=UTF-8''report.pdf`)
eq("no extension given", downloadDisposition("notes", KEY), `inline; filename="notes.pdf"; filename*=UTF-8''notes.pdf`)
eq("path parts dropped", downloadDisposition("..\\..\\etc/passwd.pdf", KEY), `inline; filename="passwd.pdf"; filename*=UTF-8''passwd.pdf`)
eq("quotes and line breaks cannot end the header", downloadDisposition('a"b\r\nSet-Cookie: x.pdf', KEY), `inline; filename="abSet-Cookie_ x.pdf"; filename*=UTF-8''abSet-Cookie_%20x.pdf`)
eq("other alphabets", downloadDisposition("résumé.pdf", KEY), `inline; filename="r_sum_.pdf"; filename*=UTF-8''r%C3%A9sum%C3%A9.pdf`)
eq("no name kept: the stored name", downloadDisposition(null, KEY), `inline; filename="${ID}.pdf"; filename*=UTF-8''${ID}.pdf`)
eq("only dots", downloadDisposition("...", KEY), `inline; filename="${ID}.pdf"; filename*=UTF-8''${ID}.pdf`)
eq("an old key keeps its own ending", downloadDisposition("photo.png", "users/u/projects/p/1700000000000-photo.png"), `inline; filename="photo.png"; filename*=UTF-8''photo.png`)
eq("a long name is cut", downloadDisposition("n".repeat(400) + ".pdf", KEY).includes(`filename="${"n".repeat(120)}.pdf"`), true)

console.log(`upload-rules.assert: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
