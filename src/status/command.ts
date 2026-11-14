import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import { readCustomProviders } from "../config/custom.js";
import { readConfig } from "../config/paths.js";
import { buildCatalog } from "../providers/catalog.js";

import { formatStatus } from "./format.js";
import { describeStatus, type StatusSnapshot } from "./report.js";

export const STATUS_COMMAND = "web-access-status";
const WIDGET_KEY = "web-access-status";

/** pi truncates a widget past this many lines with its own ellipsis. */
const WIDGET_MAX_LINES = 10;

/**
 * `/web-access-status` — what this extension would do right now.
 *
 * Read-only by design. The configuration UI was dropped because it needs continuous
 * maintenance; a report that re-reads the file is the part that was actually useful,
 * and it doubles as the way to see an edit without restarting.
 *
 * Arguments:
 *   (none)  chain members, plus a count of the providers left out
 *   --all   every known provider
 *   --json  the raw snapshot
 *   clear   remove the widget (also accepted: hide)
 *
 * Stateless on purpose: pi gives no way to ask whether a widget is showing, so a
 * toggle would be an in-memory guess that drifts as soon as anything else clears it.
 */
export function registerStatusCommand(pi: ExtensionAPI): void {
  pi.registerCommand(STATUS_COMMAND, {
    description: "Show configured providers (clear to hide)",
    handler: async (args, ctx) => {
      const argument = args.trim();

      if (argument === "clear" || argument === "hide") {
        ctx.ui.setWidget(WIDGET_KEY, undefined);
        return;
      }

      const snapshot = loadStatus();
      if (argument === "--json") {
        deliver(JSON.stringify(snapshot, null, 2).split("\n"), ctx);
        return;
      }

      deliver(formatStatus(snapshot, { all: argument === "--all" }), ctx);
    },
  });
}

/**
 * Re-read the config on every invocation.
 *
 * Deliberately not the values captured at startup: seeing the effect of an edit
 * without restarting is the main reason to run this command.
 */
function loadStatus(): StatusSnapshot {
  const read = readConfig();
  const custom = readCustomProviders(read.config.customProviders);
  const catalog = buildCatalog(custom.additions);

  return describeStatus({
    config: read.config,
    catalog,
    env: process.env,
    configPath: read.path,
    configState: read.status,
    ...(read.error === undefined ? {} : { configError: read.error }),
    unknownKeys: read.unknownKeys,
    issues: custom.issues,
  });
}

function deliver(lines: readonly string[], ctx: ExtensionCommandContext): void {
  if (!ctx.hasUI) {
    console.log(lines.join("\n"));
    return;
  }

  // A widget rather than a notification: the report is several lines and a toast
  // would cut it. Trim here rather than letting pi append its own ellipsis, so the
  // last line can say what was left out.
  const widget =
    lines.length <= WIDGET_MAX_LINES
      ? [...lines]
      : [
          ...lines.slice(0, WIDGET_MAX_LINES - 1),
          `… ${lines.length - WIDGET_MAX_LINES + 1} more lines`,
        ];
  ctx.ui.setWidget(WIDGET_KEY, widget);
}
