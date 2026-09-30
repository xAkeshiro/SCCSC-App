/** Remembers, for this tab, that the opening animation has played. */
export const SEEN_KEY = "sccsc-intro";

/**
 * Runs in <head> before the page paints (see the root layout): the intro is already done if it
 * played in this tab, the person prefers less motion, storage is blocked, or the page is a
 * printable sheet. Then it's hidden by CSS and removed when React starts.
 */
export const INTRO_SCRIPT = `(function(){var d=document.documentElement;try{if(sessionStorage.getItem("${SEEN_KEY}")||matchMedia("(prefers-reduced-motion: reduce)").matches||location.pathname.indexOf("/print/")===0)d.setAttribute("data-intro","done")}catch(e){d.setAttribute("data-intro","done")}})()`;
