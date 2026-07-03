declare module "*.md" {
	const content: string;
	export default content;
}

// Text files imported as text
declare module "*.txt" {
	const content: string;
	export default content;
}

// Python files imported as text
declare module "*.py" {
	const content: string;
	export default content;
}

// Lark grammar files imported as text
declare module "*.lark" {
	const content: string;
	export default content;
}

// Build-time encrypted bundle assets imported as Bun file paths
declare module "*.bin" {
	const filePath: string;
	export default filePath;
}
