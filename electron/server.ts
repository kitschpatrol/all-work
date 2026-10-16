import { log } from 'lognow'
import http from 'node:http'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// Adapter-node assumes HTTPS when reconstructing request origins unless a
// protocol header is configured. Supply one so same-origin checks match this
// local HTTP app. It must be set before the handler module is imported.
process.env.PROTOCOL_HEADER = 'x-allwork-protocol'
// A large workspace's selection and column state can exceed the adapter's default request limit
process.env.BODY_SIZE_LIMIT ??= '2M'

const host = process.env.HOST ?? '127.0.0.1'
const port = Number(process.env.PORT ?? '4173')

const handlerPath = path.join(import.meta.dirname, '../../build/handler.js')
const builtServer: unknown = await import(pathToFileURL(handlerPath).href)
if (
	typeof builtServer !== 'object' ||
	builtServer === null ||
	!('handler' in builtServer) ||
	typeof builtServer.handler !== 'function'
) {
	throw new Error(`No SvelteKit handler at ${handlerPath}. Run \`pnpm build\` first.`)
}

const { handler } = builtServer as { handler: http.RequestListener }
const server = http.createServer((request, response) => {
	request.headers['x-allwork-protocol'] = 'http'
	handler(request, response)
})
server.listen(port, host, () => {
	log.info(`AllWork is running at http://${host}:${port}`)
})
