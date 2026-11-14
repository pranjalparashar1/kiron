// The prompt a friend pastes into ChatGPT, Claude or Gemini together with their PDF, slides or Word file.
// Edit the wording here; the app's "Make a quiz" screen shows whatever this says.
window.SB_PROMPT = String.raw`You are helping me remember what I read. I have attached my study material (PDF, slides or Word file). Turn it into a recall quiz that I will take in an app called Study Buddy.

STEP 1. Before writing anything, ask me two short questions and wait for my answers:
  a) What am I reading this for? (an exam, a report I'm writing, work, curiosity...) and what do I most need to be able to do or explain afterwards?
  b) How long should the quiz be? (Default: about 12 questions for a short article, 4 to 8 questions per section for a long deck or chapter.)
If the material is too long to read fully, tell me which pages you covered.

STEP 2. Write the quiz, following these rules.

What to ask
- Every question must serve my purpose from step 1. Play devil's advocate with each one: "Would knowing this help with that purpose?" If not, drop it.
- Ask about main ideas, mechanisms, definitions, trends, cause and effect, and the "so what". Skip trivia: names of events, guests, exact dates, places, unless something important happened there.
- Use numbers only when they matter: they show size, growth, a shift, or are needed for a calculation. Be precise about what a number measures (for example "searches grew 80%" is not "80% of demand").
- Prefer typed recall ("text") questions. Use "single" or "multi" choice when the point is to tell apart things that are easy to confuse (similar numbers, similar terms). Use "number" for calculations, and "order" for real sequences or rankings.
- Follow the order of the material. Group questions into sections by topic, with page or slide numbers in "ref".
- Every question gets a "hint": a nudge that makes me think, without giving the answer away.
- "answer" is the model answer: complete, plain English, 1 to 4 sentences. For choice questions, explain why the right option is right and why a tempting wrong one is wrong.
- For "text" questions, list 2 to 5 "keyPoints": the separate ideas a full answer must contain. Set "need" when only some are required (for example "name three of these six"). For each key point add "match": 2 to 6 short lowercase words, stems or synonyms that would appear in a correct answer, so the app can pre-tick it. Join two words with "+" when both must appear (for example "reinvest+rate").
- If the material poses a question but does not answer it, or you are adding your own reasoning, add the tag "discussion" and say so in the answer. Add the tag "calc" to calculation questions.
- Use only facts from the material. Do not invent numbers.

STEP 3. Output format. Reply with ONE code block of valid JSON and nothing else inside it. Use straight double quotes, no comments, no trailing commas. "correct" counts options from 0 (the first option is 0). Use this exact structure:

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
          "ref": "p. 4"
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
          "hint": "...",
          "options": ["A", "B", "C", "D", "E"],
          "correct": [0, 2, 3],
          "answer": "..."
        },
        {
          "type": "number",
          "prompt": "Calculate ... (%, two decimals)",
          "hint": "Formula or first step",
          "correct": 4.93,
          "tolerance": 0.01,
          "unit": "%",
          "tags": ["calc"],
          "answer": "Worked solution, step by step."
        },
        {
          "type": "order",
          "prompt": "Put these in order, from first to last.",
          "hint": "...",
          "items": ["Comes first", "Second", "Third", "Last"],
          "answer": "Why this order."
        }
      ]
    }
  ]
}

For "order" questions, list "items" in the CORRECT order; the app shuffles them. "hint", "ref", "need", "tags", "unit" and "match" are optional but strongly preferred. After the code block, tell me in one line how many questions you wrote and which pages you covered.`;
