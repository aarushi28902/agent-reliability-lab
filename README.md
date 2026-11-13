# Agent reliability lab (site)

Static Next.js site. It replays recorded runs of the LangGraph insurance agent. No live model, no backend, free on Vercel Hobby.
Demo with made-up data. Not insurance advice.

## Put real data in
1. In Colab (agent repo root), after the v2 run, copy scripts/export_site_data.py next to your repo and run:
   python export_site_data.py
   It writes site_data/report.json and site_data/runs.json.
2. Download both and replace the files in public/data/ (the "sample data" banner disappears because the real report has no seed flag).

## Push to GitHub (Git Bash, on your own laptop)
cd path/to/site
git init
git add .
git commit -m "Initial site"
git branch -M main
git remote add origin https://github.com/<your-username>/agent-reliability-lab.git
git push -u origin main

## Deploy
vercel.com > Add New > Project > import agent-reliability-lab > Deploy (defaults are fine).

## Run locally (optional)
npm install
npm run dev
