import Link from "next/link"

/**
 * The privacy note. Approved by the owner on 2026-11-17 (questions bd0f7235 and 08e6b638): same contact as
 * security.txt, data kept 30 days after an account closes, deletion on request within 30 days, 18 and over.
 * Every statement was read from the code that day; change it only with the owner, since it makes promises.
 * Public: middleware lets /privacy through without sign-in.
 */
export const metadata = { title: "Privacy note · Planner" }

const CONTACT = "bubune99@gmail.com"

const services: [string, string, string][] = [
  ["Vercel", "Hosts the planner and counts page views", "Every request; page views, without cookies"],
  ["Neon", "Stores the database", "Everything listed above"],
  ["Hexclave", "Handles sign-in", "Your name, email address and sign-in sessions"],
  ["Cloudflare R2", "Stores uploaded files", "The files you upload"],
  ["Anthropic", "Writes the assistant's answers", "Your messages and the project details the assistant needs to answer"],
  ["Your browser's push service (Google, Apple or Mozilla)", "Delivers phone notices", "The text of each notice"],
]

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold text-white mt-8 mb-2">{children}</h2>
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-gray-300">
      <div className="mx-auto max-w-2xl px-4 py-12 leading-relaxed">
        <Link href="/sign-in" className="text-blue-400 hover:text-blue-300">‹ Back to sign in</Link>
        <h1 className="text-3xl font-bold text-white mt-6 mb-2">Privacy note</h1>
        <p className="text-gray-400">Last updated November 17, 2026</p>

        <H>Who we are</H>
        <p>The AI Project Planner is run by Bubune (FAR CNCPT). It is invite-only. Questions about your data: <a className="text-blue-400 hover:text-blue-300" href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>

        <H>What we keep</H>
        <ul className="list-disc pl-6 space-y-1">
          <li><b className="text-white">Your account:</b> your name, email address and profile picture, from signing in.</li>
          <li><b className="text-white">Your work:</b> projects, tasks, documents, ideas, decisions, notes, checklists and the people and flows you describe.</li>
          <li><b className="text-white">Your conversations with the assistant:</b> the messages you send and its replies.</li>
          <li><b className="text-white">Files you upload.</b></li>
          <li><b className="text-white">Reports you send</b> with "Report a problem": your words, the page, the part you pointed at, a picture of it, and your screen size.</li>
          <li><b className="text-white">Money records</b>, if you use the Money tab.</li>
          <li><b className="text-white">Phone notices</b>, if you turn them on: the address your browser gives us for sending them.</li>
          <li><b className="text-white">Agent keys</b> you create, so tools like Claude Code can work with your planner.</li>
        </ul>
        <p className="mt-3">We do not sell your information or share it for advertising.</p>

        <H>Who helps us run it</H>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-white">
                <th className="py-2 pr-3 border-b border-gray-700">Service</th>
                <th className="py-2 pr-3 border-b border-gray-700">What it does</th>
                <th className="py-2 border-b border-gray-700">What it sees</th>
              </tr>
            </thead>
            <tbody>
              {services.map(([name, does, sees]) => (
                <tr key={name} className="align-top">
                  <td className="py-2 pr-3 border-b border-gray-800 text-white">{name}</td>
                  <td className="py-2 pr-3 border-b border-gray-800">{does}</td>
                  <td className="py-2 border-b border-gray-800">{sees}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <H>Cookies and your browser</H>
        <p>One cookie keeps you signed in. Your browser also remembers a few display choices, such as how dense lists are. Nothing tracks you across other sites.</p>

        <H>How long we keep it</H>
        <p>While your account exists, and for 30 days after it is closed. Then it is deleted.</p>

        <H>Your choices</H>
        <ul className="list-disc pl-6 space-y-1">
          <li>See and change your work at any time in the planner.</li>
          <li><b className="text-white">Delete your account:</b> email us and we delete your account and your data within 30 days.</li>
          <li>Ask what we hold about you, or ask us to correct it, by email.</li>
        </ul>

        <H>California</H>
        <p>If you live in California you have the right to know what personal information we collect, to have it deleted, to correct it, and not to be treated differently for asking. We do not sell or share personal information as California law defines those terms. Send requests to the email above.</p>

        <H>Age</H>
        <p>The planner is for people 18 and over. We do not knowingly keep information about anyone younger.</p>

        <H>Changes</H>
        <p>When this note changes, the date at the top changes with it.</p>
      </div>
    </div>
  )
}
