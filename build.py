#!/usr/bin/env python3
"""Builds the static site: wraps each page body in src/ with the shared head, header and footer.
Output goes next to this script (index.html, projects.html, projects/*.html, about.html, contact.html).
Run: python3 build.py"""
import pathlib, re

NAME = "Faisal Elbendary"
ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"

PAGES = [
    # (source, output, title, description, nav key)
    ("home.html", "index.html", f"{NAME} | Research-driven product builder", "I research problems and build practical software tools that solve them.", "home"),
    ("projects.html", "projects.html", f"Projects | {NAME}", "Tools and products built around real problems, research and experimentation.", "projects"),
    ("carna.html", "projects/carna.html", f"Carna case study | {NAME}", "Research-driven wellness tools: a workout generator, a recipe finder and an intake questionnaire.", "projects"),
    ("careerdb.html", "projects/careerdb.html", f"CareerDB case study | {NAME}", "A job-search management system for listings, tailored CVs and application tracking.", "projects"),
    ("skillx.html", "projects/skillx.html", f"SkillX case study | {NAME}", "Skills intelligence translated into practical AI learning.", "projects"),
    ("about.html", "about.html", f"About | {NAME}", "How I approach problems: research, product thinking and AI-assisted building.", "about"),
    ("contact.html", "contact.html", f"Contact | {NAME}", "Get in touch about a custom tool, a workflow problem or a product idea.", "contact"),
]

HEAD = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="claude:viewport-fit-sides" content="cover">
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=JetBrains+Mono:wght@400;500&family=Schibsted+Grotesk:wght@500;600;700&display=swap">
<link rel="stylesheet" href="{p}assets/styles.css">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="top">
  <div class="wrap">
    <a class="brand" href="{p}index.html">{name} <span>/ product lab</span></a>
    <nav class="nav" aria-label="Main">
      <a class="home" href="{p}index.html"{home}>Home</a>
      <a href="{p}projects.html"{projects}>Projects</a>
      <a href="{p}about.html"{about}>About</a>
      <a class="cta" href="{p}contact.html"{contact}>Contact</a>
    </nav>
  </div>
</header>
<main id="main">
"""

FOOT = """</main>
<footer class="foot">
  <div class="wrap">
    <span>&copy; <span id="year">2026</span> {name}. Research, product design and build.</span>
    <nav aria-label="Footer">
      <a href="{p}index.html">Home</a>
      <a href="{p}projects.html">Projects</a>
      <a href="{p}about.html">About</a>
      <a href="{p}contact.html">Contact</a>
    </nav>
  </div>
</footer>
<script src="{p}assets/site.js"></script>
</body>
</html>
"""

for src, out, title, desc, key in PAGES:
    depth = out.count("/")
    p = "../" * depth
    cur = {k: (' aria-current="page"' if k == key else "") for k in ("home", "projects", "about", "contact")}
    body = (SRC / src).read_text()
    body = body.replace("{p}", p)
    html = HEAD.format(title=title, desc=desc, p=p, name=NAME, **cur) + body + FOOT.format(p=p, name=NAME)
    dest = ROOT / out
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(html)
    words = len(re.sub(r"<[^>]+>", " ", body).split())
    print(f"{out}: ~{words} words")
