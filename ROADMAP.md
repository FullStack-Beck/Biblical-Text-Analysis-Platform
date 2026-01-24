# PHASE 0 — Foundation (v0.1)
Goal: Establish a clean, trustworthy data core.
  
  Deliverables:
    Normalize KJV text into:
      Books
      Chapters
      Verses
      Tokens (words)
    Normalize Strong’s lexicons (Greek & Hebrew)
    Define canonical IDs (no guessing)
    Tasks:
      Tokenize verse text deterministically
      Strip punctuation consistently
      Store original word order
      Assign token indexes per verse
      Validate lexicon fields (lemma, transliteration, definition)
    Artifacts:
      /data/
      /scripts/
      Database schema diagram
    Exit Criteria:
      Every verse can be rendered word-by-word
      No NLP guessing yet
# PHASE 1 — Core Platform (v1.0)
Goal: Users can read, search, and explore text + lexicon.
  Features:
    Verse viewer (KJV)
    Clickable words
    Strong’s lexicon pages
    Lemma-based search
    Verse occurrence lists
  API Endpoints (example):
    GET /verse/{book}/{chapter}/{verse}
    GET /lemma/{strongs_id}
    GET /search/lemma/{query}
  Frontend:
    Clean, minimal UI 
    No commentary sections
    No user opinions
  Exit Criteria:
    Text is browsable
    Lexicon is explorable
    Everything is deterministic
# PHASE 2 — Interlinear & Alignment (v2.0)
Goal: Show what the text actually says at word level.
  Features:
    Interlinear view
    Word-to-Strong’s alignment
    Morphology display (if available)
    Parallel word highlighting
  Data Requirements:
    Strong’s-tagged KJV or aligned datasets
    Token-to-lemma mapping
  UI Concepts:
    Table-based interlinear
    Hover popups
    Toggle English ↔ original language
  Exit Criteria:
    No English-word guessing
    Each Strong’s reference is intentional
# PHASE 3 — Corpus Analysis (v3.0)
Goal: Reveal patterns across Scripture.
  Features:
    Lemma frequency by book
    Co-occurrence analysis
    First/last usage tracking
    Translation variance highlighting
  Important Rule:
    The system shows patterns, not conclusions.
  Examples:
    “This lemma appears 72 times in Paul’s letters”

Not: “Paul means X”
