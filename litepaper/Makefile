# Orizon Agents Litepaper: build every published format from sections/.
#
#   make all            book, html, pdf, figures, docx, then check
#   make check          the BLO-47 acceptance test: all formats agree
#   make test           the checker's own tests
#   make all OUT=/tmp/x build into a scratch directory instead of the repo
#
# Every path is relative to this directory, so the build works wherever the
# folder is mounted (e.g. at litepaper/ inside the FE repo).

OUT       ?= .
TMP       ?= .build
PYTHON    ?= python3
PANDOC    ?= $(or $(shell command -v pandoc 2>/dev/null),$(HOME)/bin/pandoc)
SEED_REPO ?= $(HOME)/Websites-Services-2026/orizon-agents-BE-Stellar
SEED_REF  ?= origin/main
SEED_PATH ?= app/seed.py
# SEED_REPO=none skips the seed-table check (it is reported as SKIPPED).
# Chapters compared across the formats: every chapter 0.5 changed (§6 is
# BLO-47's). The .docx is compared with the -docx.md, where Mermaid is PNGs.
CHECK     ?= 2 4 5 6 7 9 10 A B C D E
# Chapters compared without the .pdf: pypdf extracts some of their code
# blocks out of order, or (§9) a table split across pages repeats its header
# inside a cell.
NO_PDF    ?= 4 5 9 A B E
# FORCE=all (or FORCE=2,5) re-renders figure PNGs whose .mmd is unchanged.
FORCE     ?=

export FORCE

BUILD := build
BOOK  := $(OUT)/Orizon-Agents-Litepaper.md

.PHONY: all book html pdf figures docx check test clean

all: book html pdf figures docx check

book:
	@mkdir -p $(OUT)
	$(PYTHON) $(BUILD)/assemble.py --out $(BOOK)

html: book
	$(PYTHON) $(BUILD)/render_html.py $(OUT) $(PANDOC) $(TMP)/html

pdf: html
	$(PYTHON) $(BUILD)/pdf.py $(OUT) $(TMP)/pdf

figures: book
	$(PYTHON) $(BUILD)/figures.py $(OUT) $(TMP)/figures

docx: book figures
	$(PYTHON) $(BUILD)/docx.py $(OUT) $(PANDOC)

check:
	$(PYTHON) $(BUILD)/check.py --out $(OUT) --pandoc $(PANDOC) $(addprefix --section ,$(CHECK)) \
	  $(addprefix --no-pdf ,$(NO_PDF)) \
	  --seed-repo $(SEED_REPO) --seed-ref $(SEED_REF) --seed-path $(SEED_PATH)

test:
	$(PYTHON) -m pytest -q $(BUILD)/tests

clean:
	rm -rf $(TMP)
