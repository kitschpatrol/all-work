/** Send a same-origin request to the local AllWork server. */
export async function request<T>(
	url: string,
	body: Record<string, unknown>,
	method = 'POST',
): Promise<T> {
	const response = await fetch(url, {
		body: JSON.stringify(body),
		headers: { 'Content-Type': 'application/json', 'X-Allwork-Request': '1' },
		method,
	})
	const result: unknown = await response.json()
	if (!response.ok) {
		throw new Error(
			typeof result === 'object' && result !== null && 'message' in result
				? String(result.message)
				: 'The request failed.',
		)
	}

	return result as T
}
