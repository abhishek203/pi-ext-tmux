import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";

type TmuxSnapshot = {
	available: boolean;
	serverRunning: boolean;
	sessions: number;
	windows: number;
	panes: number;
	sessionNames: string[];
	error?: string;
};

const STATUS_KEY = "tmux-status";
const REFRESH_INTERVAL_MS = 5000;

function countLines(text: string): number {
	return text
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean).length;
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
	return `${count} ${count === 1 ? singular : plural}`;
}

function formatSummary(snapshot: TmuxSnapshot): string {
	if (!snapshot.available) return "tmux is not installed";
	if (snapshot.error) return `tmux error: ${snapshot.error}`;
	if (!snapshot.serverRunning) return "tmux server not running (0 sessions)";

	const names = snapshot.sessionNames.length > 0 ? ` [${snapshot.sessionNames.join(", ")}]` : "";
	return `${pluralize(snapshot.sessions, "session")}, ${pluralize(snapshot.windows, "window")}, ${pluralize(snapshot.panes, "pane")}${names}`;
}

async function getTmuxSnapshot(pi: ExtensionAPI, signal?: AbortSignal): Promise<TmuxSnapshot> {
	const hasTmux = await pi.exec("sh", ["-lc", "command -v tmux >/dev/null 2>&1"], {
		signal,
		timeout: 5_000,
	});

	if (hasTmux.code !== 0) {
		return {
			available: false,
			serverRunning: false,
			sessions: 0,
			windows: 0,
			panes: 0,
			sessionNames: [],
		};
	}

	const sessionsResult = await pi.exec("tmux", ["list-sessions", "-F", "#{session_name}"], {
		signal,
		timeout: 5_000,
	});

	if (sessionsResult.code !== 0) {
		const combined = `${sessionsResult.stderr}\n${sessionsResult.stdout}`.trim();
		if (/no server running/i.test(combined)) {
			return {
				available: true,
				serverRunning: false,
				sessions: 0,
				windows: 0,
				panes: 0,
				sessionNames: [],
			};
		}

		return {
			available: true,
			serverRunning: false,
			sessions: 0,
			windows: 0,
			panes: 0,
			sessionNames: [],
			error: combined || `tmux exited with code ${sessionsResult.code}`,
		};
	}

	const sessionNames = sessionsResult.stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);

	const [windowsResult, panesResult] = await Promise.all([
		pi.exec("tmux", ["list-windows", "-a", "-F", "#{window_id}"], { signal, timeout: 5_000 }),
		pi.exec("tmux", ["list-panes", "-a", "-F", "#{pane_id}"], { signal, timeout: 5_000 }),
	]);

	return {
		available: true,
		serverRunning: true,
		sessions: sessionNames.length,
		windows: windowsResult.code === 0 ? countLines(windowsResult.stdout) : 0,
		panes: panesResult.code === 0 ? countLines(panesResult.stdout) : 0,
		sessionNames,
	};
}

function renderWidget(ctx: ExtensionContext, snapshot: TmuxSnapshot): void {
	if (!ctx.hasUI) return;

	const rightAlign = (text: string, width: number): string => {
		const clipped = truncateToWidth(text, width);
		const pad = " ".repeat(Math.max(0, width - visibleWidth(clipped)));
		return pad + clipped;
	};

	ctx.ui.setWidget(STATUS_KEY, (_tui, theme) => ({
		render(width: number): string[] {
			if (!snapshot.available) {
				return [rightAlign(theme.fg("warning", "tmux: not installed"), width)];
			}
			if (snapshot.error) {
				return [rightAlign(theme.fg("error", "tmux: error"), width)];
			}
			if (!snapshot.serverRunning) {
				return [rightAlign(theme.fg("dim", "tmux: 0 sessions"), width)];
			}

			const color = snapshot.sessions > 0 ? "success" : "dim";
			const lines = [rightAlign(theme.fg(color, `tmux: ${snapshot.sessions}`), width)];
			for (const name of snapshot.sessionNames) {
				lines.push(rightAlign(theme.fg("dim", name), width));
			}
			return lines;
		},
		invalidate(): void {},
	}));
}

export default function tmuxStatusExtension(pi: ExtensionAPI) {
	let refreshTimer: NodeJS.Timeout | undefined;
	let refreshInFlight = false;

	const refresh = async (ctx: ExtensionContext, notify = false) => {
		if (refreshInFlight) return;
		refreshInFlight = true;

		try {
			const snapshot = await getTmuxSnapshot(pi, ctx.signal);
			renderWidget(ctx, snapshot);
			if (notify && ctx.hasUI) {
				ctx.ui.notify(formatSummary(snapshot), snapshot.error ? "warning" : "info");
			}
		} finally {
			refreshInFlight = false;
		}
	};

	pi.on("session_start", async (_event, ctx) => {
		await refresh(ctx);

		if (ctx.hasUI) {
			refreshTimer = setInterval(() => {
				void refresh(ctx);
			}, REFRESH_INTERVAL_MS);
		}
	});

	pi.on("turn_end", async (_event, ctx) => {
		await refresh(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		if (refreshTimer) {
			clearInterval(refreshTimer);
			refreshTimer = undefined;
		}
		if (ctx.hasUI) {
			ctx.ui.setWidget(STATUS_KEY, undefined);
		}
	});

	pi.registerCommand("tmux-status", {
		description: "Show current tmux session, window, and pane counts",
		handler: async (_args, ctx) => {
			await refresh(ctx, true);
		},
	});

	pi.registerTool({
		name: "tmux_status",
		label: "Tmux Status",
		description: "Check whether tmux is running on this machine and report how many tmux sessions, windows, and panes currently exist.",
		promptSnippet: "Check current tmux activity on this machine.",
		promptGuidelines: [
			"Use tmux_status when the user asks how many tmux sessions are currently running or wants the current tmux state.",
		],
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, signal) {
			const snapshot = await getTmuxSnapshot(pi, signal);
			return {
				content: [{ type: "text", text: formatSummary(snapshot) }],
				details: snapshot,
			};
		},
	});
}
