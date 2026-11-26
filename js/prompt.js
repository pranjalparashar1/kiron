// The prompt anyone gives their AI chat (ChatGPT, Claude, Gemini) together with what they read.
// Edit the wording here; the "Build your own" screen shares or copies whatever this says.
const KIRON_BUILDER_PROMPT = String.raw`You are helping me remember what I read. I have attached my study material (a PDF, slides, notes, or a link). Turn it into a tap-to-answer recall quiz that I will take on my phone in an app called Kiron.

STEP 1. If I haven't said what I'm reading this for, ask me first, in one short question, and wait: "What are you reading this for, and what do you most need to be able to do or explain afterwards?"
Make about 12 questions for a short article, and 4 to 8 per section for a long deck or chapter, unless I ask for another size. If the material is too long to read fully, tell me which pages you covered.

STEP 2. Write the quiz.
- Every question must serve my purpose from step 1. Ask "would knowing this help with that?" and drop it if not.
- Ask about main ideas, mechanisms, definitions, trends, cause and effect, and the "so what". Skip trivia (event names, guests, exact dates) unless something important happened there.
- Use numbers only when they show size, growth or a shift that matters. Be precise about what a number measures.
- Prompts are short: one idea, under 25 words. Follow the order of the material, grouped into sections by topic.
- Use only facts from the material. Do not invent numbers.
- Most questions are "single": exactly 4 options, similar in length. The three wrong ones must be plausible confusions (a neighbouring concept, a swapped number from the same material, the reverse relationship). No joke options, no "all of the above".
- For calculations, the options are four formulas or setups, not four numeric answers. Add the tag "calc".
- Use "multi" (pick all that apply) or "order" (put in sequence) only when the idea is naturally like that.
- Every question gets a "hint": a nudge that makes me think, without giving the answer away.
- "answer" is one line, under 30 words, shown after I tap: why the right option is right, or what the tempting wrong one really is.

STEP 3. Give me the quiz as ONE downloadable file named after the quiz, ending in .md. If you can't make files, put it in one reply instead. Inside it, put the quiz between these two lines, as one json code block, with nothing else between them:
<!-- KIRON-QUIZ-START -->
<!-- KIRON-QUIZ-END -->
The quiz must be valid JSON: straight double quotes, no comments, no trailing commas. "correct" counts options from 0; the app shuffles options, so the right one can be listed anywhere. Maths: plain text like x^2, z_m and a/b is typeset on its own; for anything bigger write TeX between \( and \), never $, and double every backslash inside the JSON ("\\(\\frac{a}{b}\\)"). Use this structure:

{
  "format": "study-buddy-quiz",
  "version": 1,
  "id": "short-lowercase-name-with-hyphens",
  "title": "Short quiz title",
  "source": "What the material is",
  "purpose": "One sentence: what I'm reading this for",
  "sections": [
    {
      "title": "Section topic",
      "ref": "pp. 2-10",
      "questions": [
        { "type": "single", "prompt": "Why does X happen?", "hint": "Think about ...", "options": ["The right explanation", "A neighbouring idea", "The reverse relationship", "A common misconception"], "correct": 0, "answer": "One line on why.", "ref": "p. 4" },
        { "type": "multi", "prompt": "Which of these ...? Pick all that apply.", "hint": "...", "options": ["A", "B", "C", "D", "E"], "correct": [0, 2, 3], "answer": "..." },
        { "type": "order", "prompt": "Put these in order, first to last.", "hint": "...", "items": ["First", "Second", "Third", "Last"], "answer": "Why this order." }
      ]
    }
  ]
}

For "order", list "items" in the CORRECT order; the app shuffles them. After the file, tell me in one line how many questions you wrote and which pages you covered, and that I can now open Kiron, tap "Build your own" and bring the quiz in.`;

export { KIRON_BUILDER_PROMPT };
