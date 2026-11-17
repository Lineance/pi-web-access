/**
 * Narrow structural types for the CJS converters.
 *
 * `@mixmark-io/domino` bundles ambient declarations that assume the DOM lib,
 * which this repo deliberately does not load, and `turndown-plugin-gfm` ships
 * none at all. Only the surface actually used lives here; the real modules are
 * checked at runtime by the tests.
 */

declare module "@mixmark-io/domino" {
  export interface DominoElement {
    readonly tagName: string;
    readonly textContent: string;
    readonly innerHTML: string;
    getAttribute(name: string): string | null;
    setAttribute(name: string, value: string): void;
    remove(): void;
    querySelectorAll(selector: string): Iterable<DominoElement>;
  }

  export interface DominoDocument {
    readonly body: DominoElement;
    querySelector(selector: string): DominoElement | null;
    querySelectorAll(selector: string): Iterable<DominoElement>;
  }

  export function createDocument(html?: string, force?: boolean): DominoDocument;
}

declare module "turndown-plugin-gfm" {
  export interface TurndownPlugin {
    (service: unknown): void;
  }

  interface PluginSet {
    gfm: TurndownPlugin;
    highlightedCodeBlock: TurndownPlugin;
    strikethrough: TurndownPlugin;
    tables: TurndownPlugin;
    taskListItems: TurndownPlugin;
  }

  const pluginSet: PluginSet;
  export default pluginSet;
}
