// eslint-disable-next-line @typescript-eslint/naming-convention
export function GET() {
	const number = Math.floor(Math.random() * 6) + 1

	// eslint-disable-next-line n/no-unsupported-features/node-builtins
	return new Response(String(number), {
		headers: {
			'Content-Type': 'application/json',
		},
	})
}
