import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import path from "node:path";
import { PassThrough } from "node:stream";
import { startRelayPair } from "../src/sdk/transport/relay.js";

const vectorsDir = path.join(import.meta.dir, "fixtures", "sdk-frame-vectors");
type Vector = Record<string, unknown>;

async function vectors(): Promise<Vector[]> {
	return await Promise.all(
		(await fs.readdir(vectorsDir))
			.filter(name => name.endsWith(".json"))
			.sort()
			.map(async name => JSON.parse(await fs.readFile(path.join(vectorsDir, name), "utf8")) as Vector),
	);
}

function object(value: unknown): Record<string, unknown> {
	expect(value).toBeObject();
	return value as Record<string, unknown>;
}

function generated(vector: Vector): string {
	const generate = object(vector.generate);
	expect(typeof vector.prefix).toBe("string");
	expect(typeof vector.suffix).toBe("string");
	expect(typeof generate.character).toBe("string");
	expect((generate.character as string).length).toBe(1);
	expect(Number.isInteger(generate.count)).toBe(true);
	expect(generate.count as number).toBeGreaterThanOrEqual(0);
	return `${vector.prefix}${(generate.character as string).repeat(generate.count as number)}${vector.suffix}`;
}

function upstream() {
	const connections: { ws: ServerWebSocket<unknown>; messages: string[] }[] = [];
	const server = Bun.serve({
		port: 0,
		fetch(req, instance) {
			return instance.upgrade(req, { data: {} }) ? undefined : new Response("upgrade required", { status: 426 });
		},
		websocket: {
			open(ws) {
				connections.push({ ws, messages: [] });
			},
			message(ws, message) {
				connections.find(connection => connection.ws === ws)?.messages.push(String(message));
			},
		},
	});
	return { url: `ws://127.0.0.1:${server.port}`, connections, stop: () => server.stop(true) };
}

async function waitFor<T>(read: () => T | undefined): Promise<T> {
	const deadline = Date.now() + 3_000;
	while (Date.now() < deadline) {
		const value = read();
		if (value !== undefined) return value;
		await Bun.sleep(5);
	}
	throw new Error("Timed out waiting for relay output.");
}

const pairs: Array<{ close(): Promise<void>; stop(): void }> = [];
afterEach(async () => {
	await Promise.all(
		pairs.splice(0).map(async pair => {
			await pair.close();
			pair.stop();
		}),
	);
});

describe("SDK frame conformance vectors", () => {
	test("every vector has the v1 schema and executable shape", async () => {
		const all = await vectors();
		expect(all.length).toBeGreaterThan(0);
		for (const vector of all) {
			expect(vector.$schema).toBe("sdk-frame-vectors/v1");
			expect(typeof vector.name).toBe("string");
			expect(vector.expectations).toBeObject();
			expect(["frame", "record", "generator"]).toContain(vector.kind);
			if (vector.kind === "frame") {
				const text = typeof vector.rawFrame === "string" ? vector.rawFrame : JSON.stringify(object(vector.frame));
				expect(object(JSON.parse(text)).type).toEqual(
					(vector.expectations as Vector).type ?? object(JSON.parse(text)).type,
				);
				expect(
					typeof vector.rawFrame === "string" || (vector.frame !== null && typeof vector.frame === "object"),
				).toBe(true);
			}
			if (vector.kind === "record") {
				if (vector.frames !== undefined)
					for (const frame of vector.frames as unknown[]) expect(typeof object(frame).type).toBe("string");
				if (vector.lines !== undefined) {
					const lines = object(vector.lines);
					expect(lines.authSuccess).toBe("gjc-sdk-transport/1 token=discovery-token-required\n");
					expect(object(JSON.parse((lines.authFailure as string).trim()))).toMatchObject({
						type: "transport_error",
						code: "auth_failed",
					});
				}
				if (vector.staleDiscovery !== undefined)
					expect(object(vector.staleDiscovery)).toMatchObject({ stale: true, token: "" });
				if (vector.frames === undefined && vector.lines === undefined && vector.staleDiscovery === undefined)
					throw new Error("Record vector has no records.");
			}
			if (vector.kind === "generator") {
				const text = generated(vector);
				const expectations = vector.expectations as Vector;
				expect(Buffer.byteLength(text)).toBeGreaterThanOrEqual(expectations.minimumBytes as number);
				expect(["turn_stream", "control_request"]).toContain(object(JSON.parse(text)).type);
			}
		}
	});

	test("preserves every raw-frame vector through the relay", async () => {
		for (const vector of await vectors()) {
			if (typeof vector.rawFrame !== "string") continue;
			const fake = upstream();
			const input = new PassThrough();
			const output = new PassThrough();
			const received: Buffer[] = [];
			output.on("data", chunk => received.push(Buffer.from(chunk)));
			const pair = await startRelayPair({
				url: fake.url,
				token: "test-token",
				pendingCeilingBytes: 256 * 1024,
				downstream: input,
				downstreamSink: output,
				onTransportError: error => {
					throw error;
				},
			});
			pairs.push({ close: () => pair.close(), stop: fake.stop });
			const connection = await waitFor(() => fake.connections[0]);
			input.write(`${vector.rawFrame}\n`);
			expect(await waitFor(() => connection.messages[0])).toBe(vector.rawFrame);
			connection.ws.send(vector.rawFrame);
			expect((await waitFor(() => received[0])).toString()).toBe(`${vector.rawFrame}\n`);
		}
	});

	test("enforces correlations, lifecycle, and reply tokens", async () => {
		for (const vector of await vectors()) {
			const expectations = vector.expectations as Vector;
			const frames = vector.frames as Vector[] | undefined;
			if (!frames) continue;
			if (expectations.correlatesBy === "id") expect(frames[0]!.id).toBe(frames[1]!.id);
			if (expectations.lifecycle) expect(frames.map(frame => frame.type)).toEqual(expectations.lifecycle);
			if (expectations.replyTokenRequired)
				expect(frames.find(frame => frame.type === "reply")?.token).toEqual(expect.any(String));
			if (expectations.replyTokenRequired)
				expect((frames.find(frame => frame.type === "reply")?.token as string).length).toBeGreaterThan(0);
		}
	});
});
