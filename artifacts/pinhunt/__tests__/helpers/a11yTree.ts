/**
 * Accessibility tree walks shared by the screen a11y tests (B-P1-25a #52,
 * B-P1-25b #53). Not a test file: jest only runs *.test.* files.
 */
/** The host-element JSON that toJSON() returns. */
export interface Node {
  type: string;
  props: Record<string, unknown>;
  children: (Node | string)[] | null;
}

function textOf(node: Node | string | null | undefined): string {
  if (node == null) return '';
  // Icon fonts (Feather) render glyphs in the Private Use Area: they are not a name.
  if (typeof node === 'string') return node.replace(/[\uE000-\uF8FF]/g, '');
  if (node.props?.accessible === false) return '';
  return (node.children ?? []).map(c => textOf(c)).join('').trim();
}

/** Pressable host nodes without a spoken name (label or text inside) or without a role. */
export function unlabelledPressables(tree: Node | Node[] | null): string[] {
  const out: string[] = [];
  const walk = (node: Node | string) => {
    if (typeof node === 'string') return;
    const p = node.props ?? {};
    const pressable = typeof p.onClick === 'function' || (p.accessible === true && typeof p.onResponderRelease === 'function');
    if (pressable && p.accessibilityElementsHidden !== true) {
      const name = (p.accessibilityLabel ?? p['aria-label'] ?? textOf(node)) as string;
      const role = p.accessibilityRole ?? p.role;
      if (!name || !role) out.push(`${JSON.stringify(String(name).slice(0, 40))} (role: ${role ?? 'none'})`);
    }
    (node.children ?? []).forEach(c => walk(c));
  };
  (Array.isArray(tree) ? tree : tree ? [tree] : []).forEach(walk);
  return out;
}

/** Images that VoiceOver would reach on their own: not inside a named element, not hidden, no label. */
export function unlabelledImages(tree: Node | Node[] | null): string[] {
  const out: string[] = [];
  const walk = (node: Node | string, covered: boolean) => {
    if (typeof node === 'string') return;
    const p = node.props ?? {};
    const hidden = p.accessible === false || p.accessibilityElementsHidden === true || p.importantForAccessibility === 'no-hide-descendants';
    const named = p.accessible === true && !!(p.accessibilityLabel || p['aria-label']);
    if (/Image$/.test(node.type) && !covered && !hidden && !p.accessibilityLabel && !p['aria-label'] && p.accessibilityRole !== 'none') {
      out.push(`${node.type} ${JSON.stringify((p.source as { uri?: string })?.uri ?? '')}`);
    }
    (node.children ?? []).forEach(c => walk(c, covered || hidden || named));
  };
  (Array.isArray(tree) ? tree : tree ? [tree] : []).forEach(n => walk(n, false));
  return out;
}
