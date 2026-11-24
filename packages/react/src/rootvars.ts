let rule: CSSStyleRule | undefined;

export function rootVar(name: string, value: string | null): void {
  if (typeof CSSStyleSheet === "undefined" || !document.adoptedStyleSheets) return;
  if (!rule) {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(":root {}");
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    rule = sheet.cssRules[0] as CSSStyleRule;
  }
  if (value === null) rule.style.removeProperty(name);
  else rule.style.setProperty(name, value);
}
