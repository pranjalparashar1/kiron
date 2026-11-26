# Bond basics

<!-- KIRON-QUIZ-START -->
```json
{
  "format": "study-buddy-quiz",
  "version": 1,
  "id": "bond-basics",
  "title": "Bond basics",
  "source": "Fixed income notes, chapter 2",
  "purpose": "Explain how bond prices move in a client meeting",
  "sections": [
    {
      "title": "Price and yield",
      "ref": "pp. 2-5",
      "questions": [
        {
          "type": "single",
          "prompt": "When market yields rise, what happens to an existing bond's price?",
          "hint": "Think about who would pay full price for the old, lower coupon.",
          "options": [
            "It falls",
            "It rises",
            "It stays at par",
            "It moves with the coupon"
          ],
          "correct": 0,
          "answer": "New bonds pay more, so the old one must get cheaper to compete."
        },
        {
          "type": "single",
          "prompt": "Which bond's price moves most when yields change by 1%?",
          "hint": "Longer cash flows are discounted more times.",
          "options": [
            "A 30-year zero",
            "A 2-year coupon bond",
            "A 5-year coupon bond",
            "A floating-rate note"
          ],
          "correct": 0,
          "answer": "All its cash comes at the end, so it has the longest duration.",
          "tags": [
            "calc"
          ]
        }
      ]
    },
    {
      "title": "Present value",
      "ref": "p. 7",
      "questions": [
        {
          "type": "single",
          "prompt": "Which setup gives the price of a 3-year zero with face 100 at 6%?",
          "hint": "One cash flow, discounted three times.",
          "options": [
            "\\(\\frac{100}{1.06^3}\\)",
            "\\(100 \\times 1.06^3\\)",
            "\\(\\frac{100}{3 \\times 1.06}\\)",
            "\\(\\frac{100 \\times 3}{1.06}\\)"
          ],
          "correct": 0,
          "answer": "Discount the single payment of 100 by \\((1.06)^3\\).",
          "tags": [
            "calc"
          ]
        },
        {
          "type": "order",
          "prompt": "Put these in order, shortest duration first.",
          "hint": "Coupons pull duration in.",
          "items": [
            "Floating-rate note",
            "2-year coupon bond",
            "10-year coupon bond",
            "30-year zero"
          ],
          "answer": "The more cash comes early, the shorter the duration."
        }
      ]
    }
  ]
}
```
<!-- KIRON-QUIZ-END -->
