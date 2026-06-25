import type { Component } from "@gajae-code/tui";
import { Box, Container, Spacer } from "@gajae-code/tui";
import type { MessageRenderer } from "../../extensibility/extensions/types";
import type { CustomMessage } from "../../session/messages";
import { renderFramedMessage } from "./message-frame";

/**
 * Component that renders a custom message entry from extensions.
 * Uses distinct styling to differentiate from user messages.
 */
export class CustomMessageComponent extends Container {
	#box: Box;
	#customComponent?: Component;
	#expanded = false;

	constructor(
		private readonly message: CustomMessage<unknown>,
		private readonly customRenderer?: MessageRenderer,
	) {
		super();

		this.addChild(new Spacer(1));

		// Default rendering uses spacing and labels instead of a full-width background.
		this.#box = new Box(1, 1);

		this.#rebuild();
	}

	setExpanded(expanded: boolean): void {
		if (this.#expanded !== expanded) {
			this.#expanded = expanded;
			this.#rebuild();
		}
	}

	override invalidate(): void {
		super.invalidate();
		this.#rebuild();
	}

	#rebuild(): void {
		if (this.#customComponent) {
			this.removeChild(this.#customComponent);
			this.#customComponent = undefined;
		}
		this.removeChild(this.#box);

		const custom = renderFramedMessage({
			message: this.message,
			box: this.#box,
			expanded: this.#expanded,
			customRenderer: this.customRenderer,
			// Extension messages render full content; no collapse-on-fold behaviour.
		});

		if (custom) {
			this.#customComponent = custom;
			this.addChild(custom);
		} else {
			this.addChild(this.#box);
		}
	}
}
