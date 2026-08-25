// Firefox exposes a `browser` global implementing browser.runtime.getBrowserInfo,
// a Firefox-only method (Safari also implements browser.* but not this method),
// so checking for it specifically identifies Firefox rather than any browser.*
// implementer in general.
export const IS_FIREFOX =
  typeof browser !== 'undefined' && !!browser.runtime?.getBrowserInfo;
