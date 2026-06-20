/**
 * MCP (Model Context Protocol) support.
 *
 * Provides per-project .mcp.json configuration for connecting to
 * MCP servers via stdio or HTTP transports.
 */

// Client
export * from "./client";
// Config
export * from "./config";
export * from "./config-writer";
// Manager
export * from "./manager";
// Tool bridge
export * from "./tool-bridge";
// Tool cache
export * from "./tool-cache";
// Transports
export * from "./transports/http";
export * from "./transports/stdio";
// Types
export * from "./types";
