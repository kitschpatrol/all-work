import http from 'node:http'

// Adapter-node otherwise assumes HTTPS when reconstructing request origins.
// Set the protocol on the server so same-origin checks match our local HTTP app.
process.env.PROTOCOL_HEADER = 'x-allwork-protocol'
// A large workspace's selection and column state can exceed the adapter's default request limit.
process.env.BODY_SIZE_LIMIT ??= '2M'
/** @type {unknown} */
const builtServer = await import(new URL('../build/handler.js', import.meta.url).href)
if (
	typeof builtServer !== 'object' ||
	builtServer === null ||
	!('handler' in builtServer) ||
	typeof builtServer.handler !== 'function'
) {
	throw new Error('Build AllWork before starting the local server.')
}

const { handler } = /** @type {{ handler: import('node:http').RequestListener }} */ (builtServer)
const port = Number(process.env.PORT ?? '4173')
const server = http.createServer((request, response) => {
	request.headers['x-allwork-protocol'] = 'http'
	handler(request, response)
})
server.listen(port, '127.0.0.1', () => {
	console.log(`AllWork is running at http://127.0.0.1:${port}`)
})
