// ==UserScript==
// @name         Kagi to Brave fallback redirect
// @namespace    https://brog.io/
// @version      1.2
// @description  Redirect Kagi limit page to Brave Search
// @match        https://kagi.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    "use strict";

    /**
     * CONFIG
     *
     * Kagi:  https://kagi.com/?q=test
     * Brave: https://search.brave.com/search?q=test
     */
    function buildFallbackUrl(query) {
        const url = new URL("https://search.brave.com/search");
        url.searchParams.set("q", query);
        return url.toString();
    }

    const STORAGE_KEY = "kagi_last_query";

    function getQueryFromUrl() {
        try {
            const url = new URL(window.location.href);
            const q = url.searchParams.get("q");
            if (!q || q.trim() === "") {
                return null;
            }
            return q.trim();
        } catch (e) {
            return null;
        }
    }

    function saveLastQuery(query) {
        try {
            if (!query) {
                return;
            }
            localStorage.setItem(STORAGE_KEY, query);
        } catch (e) {
            // Ignore storage errors
        }
    }

    function loadLastQuery() {
        try {
            const q = localStorage.getItem(STORAGE_KEY);
            if (!q || q.trim() === "") {
                return null;
            }
            return q.trim();
        } catch (e) {
            return null;
        }
    }

    /**
     * Treat https://kagi.com/?q=... as a search page.
     */
    function isSearchPage() {
        const path = window.location.pathname || "/";
        const hasQuery = !!getQueryFromUrl();
        return (path === "/" || path === "") && hasQuery;
    }

    /**
     * Detect the Kagi limit page.
     * Uses specific elements first, avoids scanning entire body unless needed.
     */
    function pageLooksLikeLimit(root) {
        const scope = root || document;

        // Specific title element
        const infoTitle = scope.querySelector(".shl_info_title");
        if (infoTitle) {
            const t = infoTitle.textContent.toLowerCase();
            if (t.includes("wow, you do love kagi")) {
                return true;
            }
        }

        // Shorter check in desc block if available
        const desc = scope.querySelector(".shl_desc");
        if (desc) {
            const txt = desc.innerText.toLowerCase();
            if (
                txt.includes("you have used your included 300 searches for this billing period") ||
                txt.includes("searches will be paused until your subscription renews")
            ) {
                return true;
            }
        }

        return false;
    }

    function redirectToFallback(query) {
        if (!query) {
            return;
        }
        const target = buildFallbackUrl(query);
        if (!target) {
            return;
        }
        window.location.replace(target);
    }

    /**
     * Fast path:
     *  - immediately store query if this looks like a normal search page
     *  - set up a MutationObserver at document-start to catch the limit card
     */
    (function init() {
        const currentQuery = getQueryFromUrl();

        // If this is a normal Kagi search page, remember query as early as possible.
        if (isSearchPage() && currentQuery) {
            saveLastQuery(currentQuery);
        }

        // If HTML already has the limit content (in cached or very fast loads), check once.
        // This can work even at document-start for some browsers.
        document.addEventListener("DOMContentLoaded", function () {
            if (pageLooksLikeLimit(document)) {
                const q = getQueryFromUrl() || loadLastQuery();
                redirectToFallback(q);
            }
        });

        // Observe DOM mutations to detect when the limit card is injected.
        const observer = new MutationObserver(function (mutations, obs) {
            // Check only on added nodes for speed.
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (!(node instanceof HTMLElement)) {
                        continue;
                    }
                    if (pageLooksLikeLimit(node)) {
                        obs.disconnect();
                        const q = getQueryFromUrl() || loadLastQuery();
                        redirectToFallback(q);
                        return;
                    }
                }
            }
        });

        // Start observing as soon as possible.
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    })();
})();
