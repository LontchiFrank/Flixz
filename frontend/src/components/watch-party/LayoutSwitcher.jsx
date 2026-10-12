/** @format */

import React, { useState } from "react";
import { LayoutGrid, Rows3, Columns2, Tv } from "lucide-react";
import { cn } from "@/lib/utils";
import { Z } from "./zIndex";

export const LAYOUTS = [
	{ id: "cinema", label: "Cinema", icon: Rows3, description: "Movie with cameras docked underneath" },
	{ id: "floating", label: "Floating", icon: LayoutGrid, description: "Movie with draggable floating cameras" },
	{ id: "theatre", label: "Theatre", icon: Columns2, description: "Movie and cameras side by side" },
	{ id: "movie-only", label: "Movie Only", icon: Tv, description: "Just the movie, cameras hidden" },
];

// Personal, per-viewer layout choice (not synced across participants) - a
// small dropdown, switching layouts never touches playback or call state.
const LayoutSwitcher = ({ layout, onChange }) => {
	const [open, setOpen] = useState(false);
	const current = LAYOUTS.find((l) => l.id === layout) || LAYOUTS[0];
	const CurrentIcon = current.icon;

	return (
		<div className="relative">
			<button
				onClick={() => setOpen(!open)}
				data-testid="layout-switcher-btn"
				className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-2 rounded-full bg-white/10 hover:bg-white/20 transition-all text-sm">
				<CurrentIcon className="w-4 h-4" />
				<span className="hidden md:inline">{current.label}</span>
			</button>

			{open && (
				<>
					<div
						className="fixed inset-0"
						style={{ zIndex: Z.DROPDOWN - 1 }}
						onClick={() => setOpen(false)}
					/>
					<div
						className="absolute right-0 top-full mt-2 bg-[#0A0A0A] border border-white/10 rounded-xl p-2 min-w-[220px] shadow-xl"
						style={{ zIndex: Z.DROPDOWN }}>
						<p className="text-xs text-[#A1A1AA] px-3 py-2">Layout</p>
						{LAYOUTS.map((l) => {
							const Icon = l.icon;
							return (
								<button
									key={l.id}
									onClick={() => {
										onChange(l.id);
										setOpen(false);
									}}
									data-testid={`layout-option-${l.id}`}
									className={cn(
										"w-full text-left px-3 py-2 rounded-lg transition-all flex items-start gap-2.5",
										layout === l.id ? "bg-[#7C3AED] text-white" : "hover:bg-white/5"
									)}>
									<Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
									<span>
										<span className="block text-sm font-medium">{l.label}</span>
										<span
											className={cn(
												"block text-xs",
												layout === l.id ? "text-white/80" : "text-[#A1A1AA]"
											)}>
											{l.description}
										</span>
									</span>
								</button>
							);
						})}
					</div>
				</>
			)}
		</div>
	);
};

export default LayoutSwitcher;
