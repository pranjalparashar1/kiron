// The prompt a friend pastes into ChatGPT, Claude or Gemini together with their PDF, slides or Word file.
// Edit the wording here; the app's "Make a quiz" screen shows whatever this says.
window.SB_PROMPT = String.raw`You are helping me remember what I read. I have attached my study material (PDF, slides or Word file). Turn it into a tap-to-answer recall quiz that I will take on my phone in an app called Kiron.

STEP 1. Before writing anything, ask me two short questions and wait for my answers:
  a) What am I reading this for? (an exam, a report, work, curiosity...) and what do I most need to be able to do or explain afterwards?
  b) How long should the quiz be? (Default: about 12 questions for a short article, 4 to 8 per section for a long deck or chapter.)
If the material is too long to read fully, tell me which pages you covered.

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

STEP 3. Reply with ONE code block of valid JSON and nothing else inside it. Straight double quotes, no comments, no trailing commas. "correct" counts options from 0; the app shuffles options, so the right one can be listed anywhere. Use this structure:

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

For "order", list "items" in the CORRECT order; the app shuffles them. After the code block, tell me in one line how many questions you wrote and which pages you covered.`;

// Used when an imported quiz has typed questions without tap options. The quiz JSON is appended after this text.
window.SB_PROMPT_ADD = String.raw`Below is a quiz in JSON for an app called Kiron. Some "text" and "number" questions have no "mcq" field. Add one to each of them and change nothing else.

Rules for each "mcq":
- "prompt": the question rewritten so it works as multiple choice. Leave it out if the original prompt already works, and always leave it out for "number" questions.
- "options": exactly 4, similar in length. The three wrong ones must be plausible confusions, taken from the quiz's own subject (a neighbouring concept, a swapped number, the reverse relationship). No joke options, no "all of the above".
- For "number" questions the options are four formulas or setups, not four numeric answers: the right setup and three common wrong setups.
- "correct": the position of the right option, counting from 0.
- "why": one line, under 30 words, on why the right option is right.
Base every option on the question's existing "answer" and "keyPoints". Do not invent facts.

Reply with ONE code block containing the complete quiz JSON, with every other field unchanged. Straight double quotes, no comments, no trailing commas.

The quiz:`;
