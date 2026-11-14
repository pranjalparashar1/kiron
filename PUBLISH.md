# Putting Kiron online (GitHub Pages)

This gives you a free link like `https://YOUR-NAME.github.io/kiron/` that anyone can open, and that installs on an iPhone home screen like an app. No Mac, no coding, no command line. Works from a Windows/Linux computer or straight from an iPhone. About 10 minutes the first time.

**Before you start, know this:** a free GitHub Pages site is public. Anyone with the link can see the app and the sample quizzes in it (the course and report quizzes). If you don't want a sample public, leave its file out (see "Removing a sample" below). Quizzes your friends import stay on their own phones and are never uploaded.

## 1. Get the files ready

1. Download **study-buddy.zip** from the project files.
2. Unzip it.
   - **iPhone:** open the Files app, find the zip (usually in Downloads), tap it once. A folder called `study-buddy` appears.
   - **Windows:** right-click the zip, choose **Extract All**.
3. Inside the folder there are 15 files and no subfolders. That's on purpose, so you can upload them in one go.

## 2. Make a GitHub account and a repository

1. Go to **github.com/signup** and create a free account. Your username becomes part of the link, so pick one you're happy to share.
2. Once signed in, go to **github.com/new**.
   - **iPhone tip:** GitHub's phone layout hides some buttons. In Safari, tap the **aA** button in the address bar and choose **Request Desktop Website** for the steps below.
3. Fill in:
   - **Repository name:** `study-buddy`
   - **Public** (Pages is free only for public repositories)
   - Tick **Add a README file**
4. Press **Create repository**.

## 3. Upload the files

1. In your new repository, press **Add file**, then **Upload files**.
2. Press **choose your files**, open the `study-buddy` folder and select **all the files inside it** (not the folder itself).
   - iPhone: in the picker, tap **Select** (top right), then select every file.
   - Windows: click one file, then press Ctrl+A.
3. Wait until every file shows in the list, then press **Commit changes** at the bottom.

## 4. Turn on the website

1. In the repository, open **Settings** (top bar), then **Pages** (left menu, or further down the page on a phone).
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Set **Branch** to **main** and the folder to **/ (root)**, then press **Save**.
4. Wait 1 to 2 minutes and refresh the page. A box appears saying **Your site is live at** `https://YOUR-NAME.github.io/kiron/`. That's the link to share.

## 5. Install it on an iPhone

1. Open the link in **Safari** (not Chrome; only Safari can add it to the home screen properly).
2. Tap the **Share** button, scroll down, tap **Add to Home Screen**, then **Add**.
3. Open it from the home screen. It now runs full-screen, works offline once opened, and keeps answers on the phone.

Android: open the link in Chrome, tap the three-dot menu, then **Add to Home screen** or **Install app**.

## Later: changes and new quizzes

**Adding a quiz for everyone** (instead of each friend importing it):
1. Save the quiz text as a file named like `quiz-something.json`.
2. Upload it to the repository (**Add file → Upload files → Commit changes**).
3. Open `quizzes.json` in the repository, press the pencil icon, and add the file name to the list, for example:
   `"quiz-yield-measures.json", "quiz-something.json"` (each name in quotes, with commas between them). Commit.
4. Open `sw.js`, press the pencil, change the number in `kiron-v3` to the next one (`kiron-v4`, and so on), and commit. This tells phones to fetch the new version. Phones see the change on the second open.

**Removing a sample:** delete its `quiz-….json` file in the repository (open it, three-dot menu, **Delete file**), and remove its name from `quizzes.json`. Then bump `sw.js` as above.

**Replacing app files** (if I send you a new version): upload the new files the same way. GitHub replaces files with the same name. Then bump `sw.js`.

## If something goes wrong

- **The link shows a 404:** wait two more minutes; the first publish is slow. Check that `index.html` is at the top level of the repository, not inside a folder.
- **The library says "No sample quizzes found":** `quizzes.json` or a quiz file is missing, or a name in `quizzes.json` doesn't match the file name exactly.
- **An old version keeps showing on the phone:** bump the version in `sw.js`, then close the app fully and open it twice.
