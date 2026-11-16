/**
 * The Laws of UX (lawsofux.com), each placed where an agent is already made to act on it.
 *
 * Owner, 2026-11-16: "https://lawsofux.com/ These laws are things that I also want included in our building or
 * judgment for checks. I need these placed where it will actually become actionable".
 *
 * Where a law is acted on:
 *   ask:<Kind>.<question>  the planner asks it of every planned item of that kind before it is built (intakeQuestions)
 *   walk:<lens>            a walk scores the screen on that lens, and below 3 is a fix (lib/walks/walk-model.ts)
 *   walk:expected          a walk records what the person expected before each step, and what happened
 *   scan:targets           the scan measures every target (24 pixels, 44 on a phone)
 *   owner                  a matter of taste the owner judges on each change, before and after
 * Checked in ux-laws.assert.ts: every law has a place, and every place exists.
 */
export interface UxLaw { law: string; says: string; where: string[] }

export const UX_LAWS: UxLaw[] = [
  { law: "Aesthetic-Usability Effect", says: "People tend to see attractive designs as easier to use.", where: ["walk:consistent", "owner"] },
  { law: "Choice Overload", says: "Too many options can overwhelm people, making decisions harder.", where: ["ask:Menu.choices", "ask:List.narrow"] },
  { law: "Chunking", says: "Breaking information into meaningful groups makes it easier to process.", where: ["ask:Card.together"] },
  { law: "Cognitive Bias", says: "Systematic thinking errors shape how people perceive and decide.", where: ["ask:Switch.default"] },
  { law: "Cognitive Load", says: "Interfaces demand mental effort to understand and use.", where: ["walk:density"] },
  { law: "Doherty Threshold", says: "Productivity rises when the computer answers within about 400ms.", where: ["ask:Button.answer"] },
  { law: "Fitts's Law", says: "Reaching a target takes longer when it is farther away or smaller.", where: ["scan:targets", "ask:Button.answer"] },
  { law: "Flow", says: "A state of deep, energized focus during an activity.", where: ["walk:find", "walk:across"] },
  { law: "Goal-Gradient Effect", says: "People work harder as they get closer to a goal.", where: ["walk:across"] },
  { law: "Hick's Law", says: "Decisions take longer as the number and complexity of choices grow.", where: ["ask:Menu.choices"] },
  { law: "Jakob's Law", says: "Users expect your site to work like the others they already use.", where: ["ask:Editor.found", "walk:find"] },
  { law: "Law of Common Region", says: "Elements inside a clearly bounded area are seen as grouped.", where: ["ask:Card.together"] },
  { law: "Law of Proximity", says: "Nearby objects are perceived as belonging together.", where: ["ask:Card.together"] },
  { law: "Law of Prägnanz", says: "People interpret complex images in the simplest form possible.", where: ["ask:Chart.simple"] },
  { law: "Law of Similarity", says: "Similar elements are perceived as a group, even when separated.", where: ["ask:Card.together", "walk:consistent"] },
  { law: "Law of Uniform Connectedness", says: "Visually connected elements are seen as more related.", where: ["ask:Card.together"] },
  { law: "Mental Model", says: "People's beliefs about how a system works guide how they use it.", where: ["walk:expected"] },
  { law: "Miller's Law", says: "Working memory holds roughly seven items, plus or minus two.", where: ["ask:Menu.choices", "ask:Chart.simple"] },
  { law: "Occam's Razor", says: "Prefer the explanation, and the design, with the fewest assumptions.", where: ["ask:any.purpose"] },
  { law: "Paradox of the Active User", says: "People skip manuals and start using software right away.", where: ["ask:Editor.found", "walk:find"] },
  { law: "Pareto Principle", says: "About 80% of effects come from 20% of causes.", where: ["walk:find"] },
  { law: "Parkinson's Law", says: "Tasks expand to fill all the time available for them.", where: ["ask:Field.fill"] },
  { law: "Peak-End Rule", says: "People judge experiences by their most intense and final moments.", where: ["ask:Button.answer"] },
  { law: "Postel's Law", says: "Accept a wide range of inputs; send only precise output.", where: ["ask:Field.refused"] },
  { law: "Selective Attention", says: "People focus on what is tied to their goals.", where: ["ask:Card.order"] },
  { law: "Serial Position Effect", says: "People remember the first and last items in a series best.", where: ["ask:Menu.choices"] },
  { law: "Tesler's Law", says: "Every system has complexity that can only be moved, not removed.", where: ["ask:Field.fill"] },
  { law: "Von Restorff Effect", says: "The item that stands out from similar items is remembered.", where: ["ask:Card.order"] },
  { law: "Working Memory", says: "A system that briefly holds the information needed for a task.", where: ["ask:any.flow"] },
  { law: "Zeigarnik Effect", says: "Unfinished tasks are remembered better than completed ones.", where: ["ask:Editor.unfinished"] },
]

/** The laws a place puts to work, for showing beside a question or a score. */
export const lawsAt = (place: string): string[] => UX_LAWS.filter((l) => l.where.includes(place)).map((l) => l.law)
