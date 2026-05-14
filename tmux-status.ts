import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

type TmuxSnapshot = {
	available: boolean;
	serverRunning: boolean;
	sessions: number;
	sessionNames: string[];
	error?: string;
};

const STATUS_KEY = "tmux-status";
const REFRESH_INTERVAL_MS = 5000;

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
				sessionNames: [],
			};
		}

		return {
			available: true,
			serverRunning: false,
			sessions: 0,
			sessionNames: [],
			error: combined || `tmux exited with code ${sessionsResult.code}`,
		};
	}

	const sessionNames = sessionsResult.stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);

	return {
		available: true,
		serverRunning: true,
		sessions: sessionNames.length,
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

	const refresh = async (ctx: ExtensionContext) => {
		if (refreshInFlight) return;
		refreshInFlight = true;

		try {
			const snapshot = await getTmuxSnapshot(pi, ctx.signal);
			renderWidget(ctx, snapshot);
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
}
