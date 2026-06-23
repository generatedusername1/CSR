// Background Script to handle Tab Creation
// This is needed because Shift + Click typically forces a "New Window" in browsers.
// By sending a message here, we can use chrome.tabs.create to force a "New Tab" instead.

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "openTab" && request.url) {
        chrome.tabs.create({ url: request.url, active: true });
    }
});
