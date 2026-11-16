// Chromium underlines a misspelled word and hands its corrections to the app alone, in the
// `context-menu` event, and Electron draws no menu of its own: unanswered, a right-click on the
// word shows nothing. This is that menu, in the order macOS apps use; null when nothing under the
// pointer is misspelled, which leaves the right-click to the window.
export function spellingTemplate(params, { replace, learn }) {
  const word = params.misspelledWord;
  if (!word) return null;
  const guesses = params.dictionarySuggestions.map((suggestion) => ({
    label: suggestion, click: () => replace(suggestion),
  }));
  const flags = params.editFlags;
  return [
    ...(guesses.length ? guesses : [{ label: 'No Guesses Found', enabled: false }]),
    { type: 'separator' },
    { label: 'Learn Spelling', click: () => learn(word) },
    { type: 'separator' },
    { role: 'cut', enabled: flags.canCut },
    { role: 'copy', enabled: flags.canCopy },
    { role: 'paste', enabled: flags.canPaste },
  ];
}
