# Makefile — Expérience pédagogique sur les expressions régulières (site Hugo)

HUGO ?= hugo
PYTHON ?= python3
NODE ?= node
PORT ?= 1313
STATIC_PORT ?= 8000
HOST ?= 127.0.0.1

.DEFAULT_GOAL := help

.PHONY: help serve build serve-public test check clean

help: ## Affiche les commandes disponibles
	@echo "Commandes disponibles :"
	@echo "  make serve         Lance le serveur de développement Hugo (http://$(HOST):$(PORT))"
	@echo "  make build         Génère le site statique dans ./public avec Hugo"
	@echo "  make serve-public  Sert le dossier ./public avec Python (http://$(HOST):$(STATIC_PORT))"
	@echo "  make test          Exécute la suite de tests automatisés (Node.js)"
	@echo "  make check         Vérifie les prérequis (hugo, node, python3) et la syntaxe JS"
	@echo "  make clean         Supprime les fichiers générés (./public et ./resources)"

serve: ## Lance le serveur local Hugo
	@command -v $(HUGO) >/dev/null 2>&1 || { \
		echo "Erreur : '$(HUGO)' est introuvable dans le PATH."; \
		echo "Installez Hugo (ex. https://gohugo.io/installation/ ou gestionnaire de paquets) puis relancez 'make serve'."; \
		exit 1; \
	}
	@echo "Démarrage du serveur local Hugo sur http://$(HOST):$(PORT)/ ..."
	$(HUGO) server --bind $(HOST) --port $(PORT) --disableFastRender --noHTTPCache

build: ## Génère le site statique dans ./public
	@command -v $(HUGO) >/dev/null 2>&1 || { \
		echo "Erreur : '$(HUGO)' est introuvable dans le PATH."; \
		exit 1; \
	}
	@echo "Construction du site statique Hugo dans ./public ..."
	$(HUGO) --minify --cleanDestinationDir

serve-public: ## Sert le dossier ./public généré avec python3 -m http.server
	@test -d public || { \
		echo "Le dossier ./public n'existe pas encore. Lancez d'abord 'make build'."; \
		exit 1; \
	}
	@echo "Serveur statique sur http://$(HOST):$(STATIC_PORT)/ (dossier ./public) ..."
	$(PYTHON) -m http.server $(STATIC_PORT) --bind $(HOST) --directory public

test: ## Exécute la suite de tests de validation
	@command -v $(NODE) >/dev/null 2>&1 || { \
		echo "Erreur : '$(NODE)' est introuvable dans le PATH."; \
		exit 1; \
	}
	$(NODE) tests/run-tests.js

check: ## Vérifie les outils disponibles et la syntaxe JavaScript
	@echo "Vérification des outils :"
	@command -v $(HUGO) >/dev/null 2>&1 && $(HUGO) version || echo "  [ABSENT] hugo"
	@command -v $(NODE) >/dev/null 2>&1 && echo "  [OK] node $$($(NODE) -v)" || echo "  [ABSENT] node"
	@command -v $(PYTHON) >/dev/null 2>&1 && echo "  [OK] $$($(PYTHON) --version)" || echo "  [ABSENT] python3"
	@echo "Vérification syntaxique JavaScript :"
	@$(NODE) --check static/exercises.js && echo "  [OK] static/exercises.js"
	@$(NODE) --check static/regex-worker.js && echo "  [OK] static/regex-worker.js"
	@$(NODE) --check static/app.js && echo "  [OK] static/app.js"
	@$(NODE) --check static/teacher.js && echo "  [OK] static/teacher.js"
	@$(NODE) --check tests/run-tests.js && echo "  [OK] tests/run-tests.js"

clean: ## Nettoie les fichiers générés par Hugo
	rm -rf public resources .hugo_build.lock
	@echo "Répertoires ./public et ./resources supprimés."
