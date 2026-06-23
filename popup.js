document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('country-toggle');
    const labelIt = document.getElementById('label-it');
    const labelSe = document.getElementById('label-se');
    const activeModeText = document.getElementById('active-mode');

    // Default to Italy (false = Italy, true = Sweden for the checkbox logic)
    // Italy is default, so checkbox unchecked.
    // Let's define: Unchecked = Italy, Checked = Sweden.

    function updateUI(isSweden) {
        toggle.checked = isSweden;
        if (isSweden) {
            labelSe.classList.add('active');
            labelIt.classList.remove('active');
            activeModeText.innerText = 'SE';
        } else {
            labelIt.classList.add('active');
            labelSe.classList.remove('active');
            activeModeText.innerText = 'IT';
        }
    }

    // Load saved state
    chrome.storage.local.get(['countryMode'], (result) => {
        // Default to 'IT' if not set
        const mode = result.countryMode || 'IT';
        const isSweden = mode === 'SE';
        updateUI(isSweden);
    });

    // Listen for changes
    toggle.addEventListener('change', () => {
        const isSweden = toggle.checked;
        const newMode = isSweden ? 'SE' : 'IT';

        updateUI(isSweden);

        // Save state
        chrome.storage.local.set({ countryMode: newMode }, () => {
            console.log('Mode saved:', newMode);

            // Send message to active tab to update immediately
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]?.id) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        action: "updateMode",
                        mode: newMode
                    }).catch(err => {
                        // Ignore error if content script isn't loaded in the popup context or empty tab
                        console.log("Could not send message to tab (likely not the right page):", err);
                    });
                }
            });
        });
    });
});
