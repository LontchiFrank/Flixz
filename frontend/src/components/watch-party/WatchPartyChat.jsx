/** @format */

import React from "react";
import { Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Extracted as-is from the original inline markup: desktop keeps the same
// always-visible fixed-width sidebar, mobile keeps the same translate-x
// slide-over + backdrop. No animation library swap here deliberately - this
// exact transform-based approach is already proven, changing it risks a
// regression for no functional gain.
const WatchPartyChat = ({
	isOpen,
	onClose,
	messages,
	chatRef,
	newMessage,
	setNewMessage,
	onSendMessage,
	translucent = false,
}) => {
	return (
		<>
			<div
				className={`fixed lg:static inset-0 lg:border-l lg:border-white/10 flex flex-col
          ${translucent ? "bg-black/70 backdrop-blur-md" : "bg-[#050505] lg:bg-transparent"}
          z-[60] transition-transform duration-300
          ${isOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"}
          lg:w-[380px]`}>
				<div className="p-4 border-b border-white/10 flex items-center justify-between">
					<h3 className="font-semibold">Chat</h3>
					<button
						onClick={onClose}
						className="lg:hidden w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 transition-all flex items-center justify-center">
						<X className="w-4 h-4" />
					</button>
				</div>

				<div ref={chatRef} className="flex-1 overflow-y-auto p-4 space-y-4">
					{messages.length === 0 ? (
						<div className="text-center text-[#A1A1AA] py-8">
							<p>No messages yet</p>
							<p className="text-sm">Start the conversation!</p>
						</div>
					) : (
						messages.map((msg, i) => (
							<div key={i} className="chat-message">
								<div className="flex items-start gap-2">
									<div className="w-8 h-8 rounded-full bg-[#7C3AED] flex items-center justify-center text-sm font-semibold flex-shrink-0">
										{msg.user_name?.charAt(0).toUpperCase()}
									</div>
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-2">
											<span className="font-medium text-sm truncate">{msg.user_name}</span>
											<span className="text-xs text-[#52525B] flex-shrink-0">
												{new Date(msg.timestamp).toLocaleTimeString([], {
													hour: "2-digit",
													minute: "2-digit",
												})}
											</span>
										</div>
										<p className="text-sm text-[#A1A1AA] mt-1 break-words">{msg.message}</p>
									</div>
								</div>
							</div>
						))
					)}
				</div>

				<form onSubmit={onSendMessage} className="p-4 border-t border-white/10 flex gap-2">
					<Input
						value={newMessage}
						onChange={(e) => setNewMessage(e.target.value)}
						placeholder="Type a message..."
						data-testid="chat-input"
						className="bg-black/50 border-white/10"
					/>
					<Button
						type="submit"
						data-testid="send-message-btn"
						className="bg-[#7C3AED] hover:bg-[#8B5CF6] flex-shrink-0">
						<Send className="w-4 h-4" />
					</Button>
				</form>
			</div>

			{isOpen && (
				<div
					className="fixed inset-0 bg-black/50 z-[59] lg:hidden"
					onClick={onClose}
				/>
			)}
		</>
	);
};

export default WatchPartyChat;
