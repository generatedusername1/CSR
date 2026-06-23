// BOSS Quick-Linker Content Script
console.log("[BOSS Linker] Script loaded (v2.0 - Email & Modifiers)");

let currentMode = 'IT'; // Default

// Configuration
const CONFIG = {
    debounceTime: 500,
    className: 'boss-quick-link',
    // Order Regex: 9 digits, starting with 17 or 37
    regexOrder: /\b(17|37)\d{7}\b/g,
    // Profile Regex: 7 or 10 digits (Strict lookarounds to avoid emails/attrs)
    // Note: We use a string pattern for RegExp constructor if needed, or literal.
    // Literal is cleaner.
    // Negative lookbehind for @, word chars, ", ', =, - (to avoid attrs and emails)
    regexProfileStrict: /(?<![@\w"='-])(\d{7}|\d{10})(?![@\w"='-])/g,
    // Email Regex: Standard email pattern
    regexEmail: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g
};

// URLs
const URLS = {
    zendesk: (q) => `https://amway.zendesk.com/agent/search/1?copy&type=ticket&q=${q}`,
    order: (id, country) => `https://boss.amway.eu/order-details?orderId=${id}&cntryCd=${country}`,
    orderHistory: (id, country) => `https://boss.amway.eu/order-details-history?orderId=${id}&cntryCd=${country}`,
    profile: (id, market) => `https://boss.amway.eu/account/profile/${market}/abo/${id}`,
    email: (email, market) => `https://boss.amway.eu/search/account?salesPlanAff=${market}&userName=&aboNum=&partyId=&emailAddress=${email}&lastName=&taxId=&personalId=&firstName=&phoneInfo=%7B%7D&country=&postalCode=&cityName=&businessNature=BusinessOwner&businessNature=Member&businessNature=MarketingAdvisor&businessNature=Employee&businessNature=MemberPlus%7CSpecialMember%7CSocioConsumidor%7CRetailConsultant&businessNature=Customer&businessNature=AmwayOf&state=%257B%2522skip%2522%253A0%252C%2522take%2522%253A25%252C%2522sort%2522%253A%255B%257B%2522field%2522%253A%2522familyName%2522%252C%2522dir%2522%253A%2522asc%2522%257D%255D%257D`
};

// Initialize
(async () => {
    try {
        const data = await chrome.storage.local.get('countryMode');
        if (data.countryMode) {
            currentMode = data.countryMode;
        }
    } catch (e) {
        console.error("[BOSS Linker] Storage Error:", e);
    }

    // Initial run
    scanDocument();

    // Setup Observer
    setupObserver();
})();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "updateMode") {
        console.log("[BOSS Linker] Mode updated to:", request.mode);
        currentMode = request.mode;
        updateExistingDynamicLinks();
    }
});

// Global click listener for Modifiers
document.addEventListener('click', (e) => {
    if (e.target.classList.contains(CONFIG.className)) {

        // 1. ZENDESK SHORTCUT (Alt + Click)
        if (e.altKey) {
            e.preventDefault();
            e.stopPropagation();
            const plainId = e.target.dataset.originalId;
            if (plainId) {
                console.log("[BOSS Linker] Opening Zendesk for:", plainId);
                window.open(URLS.zendesk(plainId), '_blank');
            }
            return;
        }

        // 2. SWEDEN FORCE SHORTCUT (Shift + Click)
        if (e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();

            const plainId = e.target.dataset.originalId;
            const type = e.target.dataset.type;
            const isHistory = e.getModifierState("CapsLock");

            console.log(`[BOSS Linker] Shift+Click detected. CapsLock: ${isHistory}. Type: ${type}`);

            let targetUrl = '';

            if (type === 'order') {
                if (isHistory) {
                    // Force SE Order History
                    targetUrl = URLS.orderHistory(plainId, 'SE');
                } else {
                    // Keep strict Order Logic by default
                    const country = plainId.startsWith('17') ? 'IT' : 'SE';
                    targetUrl = URLS.order(plainId, country);
                }
            }
            else if (type === 'profile') {
                // Force Market 470
                targetUrl = URLS.profile(plainId, '470');
            }
            else if (type === 'email') {
                // Force Market 470
                targetUrl = URLS.email(plainId, '470');
            }

            if (targetUrl) {
                // Use Background script to open tag, to avoid "New Window" behavior of Shift key
                chrome.runtime.sendMessage({ action: "openTab", url: targetUrl });
            }
            return;
        }
    }
}, true);

let debounceTimer = null;
function setupObserver() {
    const observer = new MutationObserver((mutations) => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            scanDocument();
        }, CONFIG.debounceTime);
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
    });
}

function scanDocument(root = document.body) {
    walkAndProcess(root);
    const allElements = root.querySelectorAll('*');
    for (const el of allElements) {
        if (el.shadowRoot) {
            scanDocument(el.shadowRoot);
        }
    }
}

function walkAndProcess(root) {
    const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: function (node) {
                if (node.parentElement && (
                    node.parentElement.tagName === 'A' ||
                    node.parentElement.tagName === 'SCRIPT' ||
                    node.parentElement.tagName === 'STYLE' ||
                    node.parentElement.tagName === 'TEXTAREA' ||
                    node.parentElement.isContentEditable ||
                    node.parentElement.classList.contains(CONFIG.className)
                )) {
                    return NodeFilter.FILTER_REJECT;
                }
                if (!/\d/.test(node.textContent) && !/@/.test(node.textContent)) {
                    return NodeFilter.FILTER_SKIP;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    const nodesToProcess = [];
    while (walker.nextNode()) {
        nodesToProcess.push(walker.currentNode);
    }

    nodesToProcess.forEach(processNode);
}

function processNode(textNode) {
    const text = textNode.textContent;
    let newHtml = text;
    let changed = false;

    // 1. Replace Orders (Priority 1)
    newHtml = newHtml.replace(CONFIG.regexOrder, (match) => {
        changed = true;
        const country = match.startsWith('17') ? 'IT' : 'SE';
        const url = URLS.order(match, country);
        return createLinkHtml(match, url, 'order');
    });

    // 2. Replace Emails (Priority 2)
    newHtml = newHtml.replace(CONFIG.regexEmail, (match) => {
        changed = true;
        const market = currentMode === 'IT' ? '160' : '470';
        const url = URLS.email(match, market);
        return createLinkHtml(match, url, 'email');
    });

    // 3. Replace Profiles (Priority 3 - Strict Logic)
    newHtml = newHtml.replace(CONFIG.regexProfileStrict, (match) => {
        // Skip 9 digits (Order) overlap just in case
        if (match.length === 9) return match;

        changed = true;
        const market = currentMode === 'IT' ? '160' : '470';
        const url = URLS.profile(match, market);
        return createLinkHtml(match, url, 'profile');
    });

    if (changed) {
        const wrapper = document.createElement('span');
        wrapper.innerHTML = newHtml;
        textNode.replaceWith(...wrapper.childNodes);
    }
}

function createLinkHtml(text, url, type) {
    return `<a href="${url}" target="_blank" class="${CONFIG.className}" data-original-id="${text}" data-type="${type}" style="color: blue !important; text-decoration: underline !important; cursor: pointer;">${text}</a>`;
}

function updateExistingDynamicLinks() {
    function updateInRoot(root) {
        const links = root.querySelectorAll(`a.${CONFIG.className}`);
        links.forEach(link => {
            const id = link.dataset.originalId;
            const type = link.dataset.type;
            if (!id || !type) return;

            if (type === 'profile') {
                const market = currentMode === 'IT' ? '160' : '470';
                link.href = URLS.profile(id, market);
            } else if (type === 'email') {
                const market = currentMode === 'IT' ? '160' : '470';
                link.href = URLS.email(id, market);
            }
        });

        const allElements = root.querySelectorAll('*');
        for (const el of allElements) {
            if (el.shadowRoot) updateInRoot(el.shadowRoot);
        }
    }

    updateInRoot(document.body);
}
