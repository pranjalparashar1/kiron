// The prompt a friend pastes into ChatGPT, Claude or Gemini together with their PDF, slides or Word file.
// Edit the wording here; the app's "Make a quiz" screen shows whatever this says.
window.SB_PROMPT = String.raw`You are helping me remember what I read. I have attached my study material (PDF, slides or Word file). Turn it into a recall quiz that I will take in an app called Kiron.

STEP 1. Before writing anything, ask me two short questions and wait for my answers:
  a) What am I reading this for? (an exam, a report I'm writing, work, curiosity...) and what do I most need to be able to do or explain afterwards?
  b) How long should the quiz be? (Default: about 12 questions for a short article, 4 to 8 questions per section for a long deck or chapter.)
If the material is too long to read fully, tell me which pages you covered.

STEP 2. Write the quiz, following these rules.

What to ask
- Every question must serve my purpose from step 1. Play devil's advocate with each one: "Would knowing this help with that purpose?" If not, drop it.
- Ask about main ideas, mechanisms, definitions, trends, cause and effect, and the "so what". Skip trivia: names of events, guests, exact dates, places, unless something important happened there.
- Use numbers only when they matter: they show size, growth, a shift, or are needed for a calculation. Be precise about what a number measures (for example "searches grew 80%" is not "80% of demand").
- Keep every prompt short: one idea, under 25 words where possible. I read these on a phone.
- Follow the order of the material. Group questions into sections by topic, with page or slide numbers in "ref".
- Use only facts from the material. Do not invent numbers.

Every question comes in TWO forms, because the app has two revision modes
1. The typed form (In-depth revision). Use type "text" for recall and "number" for calculations. Use "single", "multi" or "order" only when the question is naturally a choice or a sequence.
   - "answer" is the model answer: complete, plain English, 1 to 4 sentences.
   - "text" questions list 2 to 5 "keyPoints": the separate ideas a full answer needs. Set "need" when only some are required. Give each key point "match": 2 to 6 short lowercase words, stems or synonyms a correct answer would contain, so the app can pre-tick it. Join two words with "+" when both must appear.
   - Every question gets a "hint": a nudge that makes me think, without giving the answer away.
2. The tap form (Early revision). Every "text" and "number" question must also have "mcq": the same idea as a four-option multiple choice, answerable with one tap and no typing or calculating.
   - "mcq.prompt": rewrite the question so it works as multiple choice (for example "Name the three sources of return" becomes "Which list has the three sources of return?"). Leave it out only if the original prompt already works.
   - "mcq.options": exactly 4, similar in length and style. The three wrong ones must be plausible: build them from the confusions a learner really has (a neighbouring concept, a swapped number from the same material, the reverse relationship). No joke options, no "all of the above".
   - For "number" questions the options are four formulas or setups, NOT four numeric answers. One is the right setup; the others are the common wrong setups (wrong divisor, wrong number of periods, rate not halved, and so on). Leave out "mcq.prompt" for these.
   - "mcq.correct": the position of the right option, counting from 0. The app shuffles the options, so you can list the right one first.
   - "mcq.why": one line (under 30 words) shown after I tap: why the right option is right, or what the tempting wrong one really is.
- If the material poses a question but does not answer it, or you are adding your own reasoning, add the tag "discussion" and say so in the answer. Add the tag "calc" to calculation questions.

STEP 3. Output format. Reply with ONE code block of valid JSON and nothing else inside it. Use straight double quotes, no comments, no trailing commas. "correct" counts options from 0. Use this exact structure:

{
  "format": "study-buddy-quiz",
  "version": 1,
  "id": "short-lowercase-name-with-hyphens",
  "title": "Short quiz title",
  "source": "What the material is, e.g. 'Module 3 slides, Corporate Finance'",
  "purpose": "One sentence: what I'm reading this for (from step 1)",
  "about": "One or two sentences on what the quiz covers",
  "sections": [
    {
      "title": "Section topic",
      "ref": "pp. 2-10",
      "questions": [
        {
          "type": "text",
          "prompt": "Why does X happen?",
          "hint": "Think about ...",
          "keyPoints": [
            { "text": "First idea a full answer needs", "match": ["word", "stem", "synonym"] },
            { "text": "Second idea", "match": ["other", "word+together"] }
          ],
          "need": 2,
          "answer": "Model answer in plain sentences.",
          "ref": "p. 4",
          "mcq": {
            "prompt": "Which of these explains why X happens?",
            "options": ["The right explanation", "A neighbouring but wrong idea", "The reverse relationship", "A common misconception"],
            "correct": 0,
            "why": "One line on why the first option is right."
          }
        },
        {
          "type": "number",
          "prompt": "A 5-year 4% annual bond is discounted at 6%. Price per 100?",
          "hint": "Formula or first step",
          "correct": 91.58,
          "tolerance": 0.01,
          "unit": "",
          "tags": ["calc"],
          "answer": "Worked solution, step by step.",
          "mcq": {
            "options": ["4/1.06 + 4/1.06^2 + ... + 104/1.06^5", "4/1.04 + 4/1.04^2 + ... + 104/1.04^5", "6/1.04 + ... + 106/1.04^5", "(5 x 4 + 100) / 1.06^5"],
            "correct": 0,
            "why": "Coupons of 4, each discounted at the 6% market rate."
          }
        },
        {
          "type": "single",
          "prompt": "Which of these ...?",
          "hint": "...",
          "options": ["Option A", "Option B", "Option C", "Option D"],
          "correct": 1,
          "answer": "B, because ... A is tempting but ..."
        },
        {
          "type": "multi",
          "prompt": "Which of these ...? Pick all that apply.",
          "options": ["A", "B", "C", "D", "E"],
          "correct": [0, 2, 3],
          "answer": "..."
        },
        {
          "type": "order",
          "prompt": "Put these in order, from first to last.",
          "items": ["Comes first", "Second", "Third", "Last"],
          "answer": "Why this order."
        }
      ]
    }
  ]
}

For "order" questions, list "items" in the CORRECT order; the app shuffles them. "hint", "ref", "need", "tags", "unit" and "match" are optional but strongly preferred. "mcq" is required on every "text" and "number" question. After the code block, tell me in one line how many questions you wrote and which pages you covered.`;

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
